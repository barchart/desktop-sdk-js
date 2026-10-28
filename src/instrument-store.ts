// Internal: state per instrument, keyed by marketId: one listed instrument on its exchange. Not exported from index.ts.
import type { DepthPriceLevel, InstrumentDefinition, MarketSnapshot, MarketUpdate, OpenfeedGatewayMessage } from "@openfeed/sdk-js";
import { formatQuote, type FormattedQuote } from "./formatted-quote";
import { createInstrument, type Instrument } from "./instrument";
import { applyDepth, bookFromSnapshot, type Book } from "./reducers/book";
import { lastSteps, seedSteps, tradeSteps, type CumulativeVolumeStep } from "./reducers/cumulative";
import { applySnapshot, applyUpdate, type QuoteRecord } from "./reducers/quote";
import type { LastMessages, PriceVolume, SdkLogger } from "./types";

interface InstrumentState {
    instrument: Instrument;
    quote: QuoteRecord | undefined;
    book: Book | undefined;
    /** Undefined until a snapshot brings volume at price; trades don't start it. */
    volumes: Map<number, number> | undefined;
    /** `volumes` as subscribers get them: ascending by price, frozen; rebuilt when they change. */
    levels: readonly PriceVolume[] | undefined;
    lastSnapshot: OpenfeedGatewayMessage | undefined;
    lastUpdate: MarketUpdate | undefined;
}

/**
 * An instrument's state, by the subscription method that gets it, shaped as that method's event carries it. In a
 * change, only the parts the message changed are present; a first delivery has every part there is.
 */
export interface StateParts {
    readonly quote?: { readonly quote: QuoteRecord; readonly formatted: FormattedQuote };
    readonly depth?: { readonly book: Book };
    readonly cumulativeVolume?: { readonly levels: readonly PriceVolume[]; readonly changed: readonly PriceVolume[] };
}

/** What one message changed in one instrument. */
export interface InstrumentChange {
    readonly marketId: string;
    readonly kind: "snapshot" | "update";
    readonly parts: StateParts;
}

/** Applies steps in order; each adds its delta to the total at its price. */
const applySteps = (volumes: Map<number, number>, steps: readonly CumulativeVolumeStep[]) => {
    for (const { price, delta } of steps) {
        volumes.set(price, (volumes.get(price) ?? 0) + delta);
    }
};

/** Every level, ascending by price, frozen. */
const toLevels = (volumes: Map<number, number>): readonly PriceVolume[] =>
    Object.freeze([...volumes].sort(([a], [b]) => a - b).map(([price, volume]) => Object.freeze({ price, volume })));

/** The levels the steps touched, each price once with its volume after them, ascending by price, frozen. */
const toChanged = (volumes: Map<number, number>, steps: readonly CumulativeVolumeStep[]): readonly PriceVolume[] =>
    Object.freeze(
        [...new Set(steps.map((step) => step.price))].sort((a, b) => a - b).map((price) => Object.freeze({ price, volume: volumes.get(price) ?? 0 }))
    );

/** Applies steps to a market's levels; their part of the change, or undefined if the market has none or there are no steps. */
const updateLevels = (market: InstrumentState, steps: readonly CumulativeVolumeStep[]): StateParts["cumulativeVolume"] => {
    if (!market.volumes || !steps.length) {
        return undefined;
    }
    applySteps(market.volumes, steps);
    market.levels = toLevels(market.volumes);
    return { levels: market.levels, changed: toChanged(market.volumes, steps) };
};

const freezeBook = (book: Book): Book => {
    for (const level of book.bids) {
        Object.freeze(level);
    }
    for (const level of book.asks) {
        Object.freeze(level);
    }
    Object.freeze(book.bids);
    Object.freeze(book.asks);
    return Object.freeze(book);
};

/**
 * State only. Which subscribed symbol names which market is the registry's (each entry's named markets); the store
 * never decides when a market goes: the SDK calls removeId once no subscription names it (DesktopSdk.#tryRemoveId).
 */
export class InstrumentStore {
    readonly #instruments = new Map<string, InstrumentState>();
    /** Each definition's own symbol → market; how an instrument is found by its own symbol (a root subscription's, say). */
    readonly #bySymbol = new Map<string, string>();

    constructor(private readonly log: SdkLogger) {}

    /** The market's state and its instrument-symbol index entry go. */
    removeId(marketId: string) {
        const market = this.#instruments.get(marketId);
        this.#instruments.delete(marketId);
        if (market && this.#bySymbol.get(market.instrument.symbol) === marketId) {
            this.#bySymbol.delete(market.instrument.symbol);
        }
    }

    /** `instrumentAction` EXCHANGE_MOVE: the instrument and its state move to a new marketId. */
    moved(from: string, to: string) {
        const state = this.#instruments.get(from);
        if (!state || from === to) {
            return;
        }
        this.#instruments.delete(from);
        this.#instruments.set(to, state);
        for (const [symbol, id] of this.#bySymbol) {
            if (id === from) {
                this.#bySymbol.set(symbol, to);
            }
        }
    }

    /** The market whose definition has this symbol. */
    getMarketId(symbol: string): string | undefined {
        return this.#bySymbol.get(symbol);
    }

    clear() {
        this.#instruments.clear();
        this.#bySymbol.clear();
    }

    // Getters by marketId; undefined in, undefined out, so a lookup can be passed straight through.

    getInstrumentById(marketId: string | undefined): Instrument | undefined {
        return this.#get(marketId)?.instrument;
    }

    getQuoteById(marketId: string | undefined): QuoteRecord | undefined {
        return this.#get(marketId)?.quote;
    }

    getBookById(marketId: string | undefined): Book | undefined {
        return this.#get(marketId)?.book;
    }

    /** Ascending by price. */
    getCumulativeVolumeById(marketId: string | undefined): readonly PriceVolume[] | undefined {
        return this.#get(marketId)?.levels;
    }

    /** Every part of the current state, for a first delivery. */
    getStatePartsById(marketId: string | undefined): StateParts {
        const market = this.#get(marketId);
        if (!market) {
            return {};
        }
        return {
            quote: market.quote ? { quote: market.quote, formatted: formatQuote(market.quote, market.instrument) } : undefined,
            depth: market.book ? { book: market.book } : undefined,
            cumulativeVolume: market.levels ? { levels: market.levels, changed: market.levels } : undefined,
        };
    }

    /** The whole last snapshot message, the `raw` of `initial` events. */
    getLastSnapshotMessageById(marketId: string | undefined): OpenfeedGatewayMessage | undefined {
        return this.#get(marketId)?.lastSnapshot;
    }

    getLastMessagesById(marketId: string | undefined): LastMessages | undefined {
        const market = this.#get(marketId);
        if (!market) {
            return undefined;
        }
        return { snapshot: market.lastSnapshot?.marketSnapshot, update: market.lastUpdate };
    }

    /** Applies one message; returns what changed, or undefined if it changed no market state. */
    apply(message: OpenfeedGatewayMessage): InstrumentChange | undefined {
        if (message.instrumentDefinition) {
            this.#define(message.instrumentDefinition);
            return undefined;
        }
        if (message.marketSnapshot) {
            return this.#snapshot(message, message.marketSnapshot);
        }
        if (message.marketUpdate) {
            return this.#update(message.marketUpdate);
        }
        return undefined;
    }

    #get(marketId: string | undefined): InstrumentState | undefined {
        return marketId === undefined ? undefined : this.#instruments.get(marketId);
    }

    #define(definition: InstrumentDefinition) {
        const marketId = definition.marketId.toString();
        const instrument = createInstrument(definition, this.log);
        const market = this.#instruments.get(marketId);
        if (market) {
            market.instrument = instrument;
        } else {
            this.#instruments.set(marketId, {
                instrument,
                quote: undefined,
                book: undefined,
                volumes: undefined,
                levels: undefined,
                lastSnapshot: undefined,
                lastUpdate: undefined,
            });
        }
        this.#bySymbol.set(definition.symbol, marketId);
    }

    #snapshot(message: OpenfeedGatewayMessage, snapshot: MarketSnapshot): InstrumentChange | undefined {
        const marketId = snapshot.marketId.toString();
        const market = this.#instruments.get(marketId);
        // none after its last subscription went, or before its definition: skipped
        if (!market) {
            return undefined;
        }
        const { instrument } = market;

        market.lastSnapshot = message;
        market.quote = Object.freeze(applySnapshot(snapshot, instrument));

        // no book unless the snapshot has price levels; an existing book stays
        const book = bookFromSnapshot(snapshot.priceLevels, instrument);
        if (book) {
            market.book = freezeBook(book);
        }

        // volume at price starts the levels over
        if (snapshot.volumeAtPrice) {
            market.volumes = new Map();
            applySteps(market.volumes, seedSteps(snapshot.volumeAtPrice, instrument));
            market.levels = toLevels(market.volumes);
        }

        return {
            marketId,
            kind: "snapshot",
            parts: {
                quote: { quote: market.quote, formatted: formatQuote(market.quote, instrument) },
                // freezeBook froze `book` itself, so it's market.book
                depth: book ? { book } : undefined,
                cumulativeVolume: snapshot.volumeAtPrice && market.levels ? { levels: market.levels, changed: market.levels } : undefined,
            },
        };
    }

    #update(update: MarketUpdate): InstrumentChange | undefined {
        const marketId = update.marketId.toString();
        const market = this.#instruments.get(marketId);
        // ignored until the first snapshot
        if (!market?.quote) {
            return undefined;
        }
        const { instrument } = market;
        market.lastUpdate = update;

        // trades only count towards CV (and lastSize) when the update carries session.last
        const trades = update.trades && update.session?.last ? tradeSteps(update.trades, update.session.last.price, instrument) : undefined;

        const previous = market.quote;
        const next = applyUpdate(previous, update, instrument, trades?.lastSize);
        const quoteChanged = next !== previous;
        if (quoteChanged) {
            market.quote = Object.freeze(next);
        }

        const steps = trades?.steps ?? (update.last ? lastSteps(next.session.last, next.session.lastSize) : []);

        return {
            marketId,
            kind: "update",
            parts: {
                // Object.freeze froze `next` itself, so it's market.quote
                quote: quoteChanged ? { quote: next, formatted: formatQuote(next, instrument) } : undefined,
                depth: update.depthPriceLevel ? this.#applyDepth(market, update, update.depthPriceLevel) : undefined,
                cumulativeVolume: updateLevels(market, steps),
            },
        };
    }

    /** Applies a depth update to the market's book; its part of the change, or undefined (with a warning) without a book. */
    #applyDepth(market: InstrumentState, update: MarketUpdate, depth: DepthPriceLevel): StateParts["depth"] {
        if (!market.book) {
            this.log.warn("OF SDK > No book found for", update.symbol || update.marketId.toString());
            return undefined;
        }
        market.book = freezeBook(applyDepth(market.book, depth, market.instrument, update.symbol, this.log));
        return { book: market.book };
    }
}
