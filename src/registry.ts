// Internal: subscriptions as desired state, reconciled with the wire per login (docs/design.md, "The registry").
// Only the subscription loop (DesktopSdk#process) calls acquire and remove. acquire sends a new entry when logged
// in; remove at 0 unsubscribes and deletes at once. Not exported from index.ts.
import { type IOpenFeedClient, type OpenfeedGatewayMessage, Result, Service, type SubscriptionResponse, SubscriptionType } from "@openfeed/sdk-js";
import type Long from "long";
import { getMessageSubscribers, subscriptionKey, type Subscriber } from "./subscriber";
import { type SdkLogger, SubscriptionError, type SubscriptionState } from "./types";

export interface Entry {
    readonly key: string;
    readonly service: Service;
    readonly type: SubscriptionType;
    readonly symbol: string;

    // desired: kept across logins
    readonly subscribers: Set<Subscriber>;
    /** Subscribers plus dependent entries. */
    refs: number;
    /** Entries that hold this one as a dependency (CV on ALL); its error is theirs too. */
    readonly dependents: Set<Entry>;
    readonly dependencies: Entry[];

    // wire: one login's
    clientId: Long | undefined;
    status: Exclude<SubscriptionState, "closed">;
    error: SubscriptionError | undefined;
    response: SubscriptionResponse | undefined;
    /**
     * The markets this entry's successful responses named; raw subscribers get their messages. Read-only outside the
     * registry, which changes it only through #name/#unname, so its market index stays in step.
     */
    readonly markets: ReadonlySet<string>;
}

/** The registry's own view of an entry: the one place its markets can change. */
interface OwnEntry extends Entry {
    readonly markets: Set<string>;
    readonly dependencies: OwnEntry[];
}

const serviceLabels: Partial<Record<Service, string>> = {
    [Service.DELAYED]: "D",
    [Service.DELAYED_SNAPSHOT]: "DS",
    [Service.END_OF_DAY]: "EOD",
    [Service.REAL_TIME]: "RT",
    [Service.REAL_TIME_SNAPSHOT]: "RTS",
};
const typeLabels: Partial<Record<SubscriptionType, string>> = {
    [SubscriptionType.ALL]: "ALL",
    [SubscriptionType.CUMULATIVE_VOLUME]: "CV",
    [SubscriptionType.DEPTH_PRICE]: "DP",
    [SubscriptionType.TRADES]: "T",
};

/** The entries that are on the wire (sent on this login), as `RT ZCZ26 ALL, RT ESZ26 T`; empty if none are. */
export const getWireLabels = (entries: Iterable<Entry>): string =>
    [...entries]
        .filter((entry) => entry.clientId !== undefined)
        .map((entry) => `${serviceLabels[entry.service] ?? "?"} ${entry.symbol} ${typeLabels[entry.type] ?? "?"}`)
        .join(", ");

/** State subscribers and dependencies make an entry's symbol link to the markets it named; raw subscribers don't. */
const keepsState = (entry: Entry): boolean => entry.dependents.size > 0 || [...entry.subscribers].some((subscriber) => subscriber.method !== "raw");

/** The protocol's marketId of a message, if it's about one market. An instrument action is about its old one. */
export const getMessageMarketId = (message: OpenfeedGatewayMessage): string | undefined => {
    const id =
        message.instrumentDefinition?.marketId ??
        message.marketSnapshot?.marketId ??
        message.marketUpdate?.marketId ??
        message.instrumentAction?.instrument?.marketId;
    return id?.toString();
};

/**
 * The one record of which subscribed symbol names which market: each entry's `markets` (what its successful responses
 * named). A symbol "links" to a market when a state-keeping entry under it named it; nothing else keeps a copy.
 * Indexed by symbol and by market, so the per-message lookups don't scan every entry.
 */
export class Registry {
    readonly #entries = new Map<string, OwnEntry>();
    readonly #entriesBySymbol = new Map<string, Set<OwnEntry>>();
    /** Entries by the markets they named; kept in step with each entry's `markets` (#name, #unname). */
    readonly #entriesByMarket = new Map<string, Set<OwnEntry>>();
    #client: IOpenFeedClient | undefined;

    constructor(private readonly log: SdkLogger) {}

    getAllEntries(): Iterable<Entry> {
        return this.#entries.values();
    }

    getEntries(symbol: string): Entry[] {
        return [...(this.#entriesBySymbol.get(symbol) ?? [])];
    }

    /**
     * The market a subscribed symbol names: the one a state-keeping entry under it named last (an alias's new market,
     * once its repeated response came, until ALIAS_CHANGED takes the old one away).
     */
    getMarketId(symbol: string): string | undefined {
        const named = [...(this.#entriesBySymbol.get(symbol) ?? [])].filter(keepsState).flatMap((entry) => [...entry.markets]);
        return named.at(-1);
    }

    /** The subscribed symbols that link to the market: those of the state-keeping entries that named it. */
    getSymbolsById(marketId: string): string[] {
        const symbols = new Set<string>();
        for (const entry of this.#entriesByMarket.get(marketId) ?? []) {
            if (keepsState(entry)) {
                symbols.add(entry.symbol);
            }
        }
        return [...symbols];
    }

    /**
     * Takes one reference, creating the entry (and sending it, when logged in) if needed. Entries created, its
     * dependencies included, are collected in `created`.
     */
    acquire(service: Service, type: SubscriptionType, symbol: string, created: Entry[]): Entry {
        return this.#acquire(service, type, symbol, created);
    }

    #acquire(service: Service, type: SubscriptionType, symbol: string, created: Entry[]): OwnEntry {
        const entry = this.#entries.get(subscriptionKey(service, type, symbol)) ?? this.#create(service, type, symbol, created);
        entry.refs += 1;
        return entry;
    }

    /**
     * Gives back one reference. At 0 the entry is unsubscribed (when logged in) and removed, and its dependencies give
     * back theirs, which can remove those too. A subscribe and unsubscribe in the same task never reach the wire: the
     * Openfeed client removes the pair. Returns the removed entries.
     */
    remove(entry: Entry): Entry[] {
        const own = this.#entries.get(entry.key);
        // already removed
        if (own !== entry) {
            return [];
        }
        own.refs -= 1;
        if (own.refs > 0) {
            return [];
        }
        const removed: Entry[] = [];
        this.#delete(own, removed);
        return removed;
    }

    /** Login: every entry goes on the new client. */
    attach(client: IOpenFeedClient) {
        this.#client = client;
        for (const entry of this.#entries.values()) {
            this.#send(entry);
        }
    }

    /** Logout or rejected credentials: the client is being thrown away, so its ids, answers and errors go too. */
    detach() {
        this.#client = undefined;
        for (const entry of this.#entries.values()) {
            entry.clientId = undefined;
            entry.status = "pending";
            entry.error = undefined;
            entry.response = undefined;
            entry.markets.clear();
        }
        this.#entriesByMarket.clear();
    }

    /** Dispose: every subscriber is closed and every entry removed, without unsubscribing. */
    clear() {
        this.#client = undefined;
        for (const entry of [...this.#entries.values()]) {
            for (const subscriber of entry.subscribers) {
                subscriber.closed = true;
            }
            entry.subscribers.clear();
        }
        this.#entries.clear();
        this.#entriesBySymbol.clear();
        this.#entriesByMarket.clear();
    }

    /** Matches a response to its entries by symbol and type (the client's ids aren't on the wire). */
    onResponse(response: SubscriptionResponse): Entry[] {
        // errors on unsubscribe responses are ignored
        if (response.unsubscribe) {
            return [];
        }
        const matched = [...(this.#entriesBySymbol.get(response.symbol) ?? [])].filter((e) => e.type === response.subscriptionType);

        for (const entry of matched) {
            entry.response = response;
            if (response.status?.result === Result.SUCCESS) {
                entry.status = "active";
                entry.error = undefined;
                // a response without a market names none, as the JS client skips it
                if (!response.marketId.isZero()) {
                    this.#name(entry, response.marketId.toString());
                }
            } else {
                entry.status = "error";
                entry.error = new SubscriptionError(
                    response.status?.result ?? Result.UNKNOWN_RESULT,
                    response.symbol,
                    response.subscriptionType,
                    response.status?.message ?? ""
                );
                for (const subscriber of [...entry.subscribers]) {
                    subscriber.fail(entry.error);
                }
                // a CV doesn't update without its ALL; one already failed on its own has told its subscribers
                for (const dependent of [...entry.dependents].filter((d) => !d.error)) {
                    for (const subscriber of [...dependent.subscribers]) {
                        subscriber.fail(entry.error);
                    }
                }
            }
        }
        return matched;
    }

    /** Whether any entry's successful responses named the market (state or raw: its state must stay while one does). */
    hasId(marketId: string): boolean {
        return (this.#entriesByMarket.get(marketId)?.size ?? 0) > 0;
    }

    /** Subscribers that take raw messages (raw ones, and state ones with `onMessage`) on entries that named this market. */
    getMessageSubscribersById(marketId: string): Subscriber[] {
        return [...(this.#entriesByMarket.get(marketId) ?? [])].flatMap(getMessageSubscribers);
    }

    /** `instrumentAction` ALIAS_CHANGED: the alias's entries stop naming the old instrument. */
    aliasChanged(alias: string, marketId: string) {
        for (const entry of this.#entriesBySymbol.get(alias) ?? []) {
            this.#unname(entry, marketId);
        }
    }

    /** `instrumentAction` EXCHANGE_MOVE: entries that named the instrument name its new marketId. */
    moved(from: string, to: string) {
        for (const entry of [...(this.#entriesByMarket.get(from) ?? [])]) {
            this.#unname(entry, from);
            this.#name(entry, to);
        }
    }

    // `entry.markets` changes only through these two, so the market index stays in step.

    #name(entry: OwnEntry, marketId: string) {
        entry.markets.add(marketId);
        let entries = this.#entriesByMarket.get(marketId);
        if (!entries) {
            this.#entriesByMarket.set(marketId, (entries = new Set()));
        }
        entries.add(entry);
    }

    #unname(entry: OwnEntry, marketId: string) {
        entry.markets.delete(marketId);
        const entries = this.#entriesByMarket.get(marketId);
        if (entries?.delete(entry) && entries.size === 0) {
            this.#entriesByMarket.delete(marketId);
        }
    }

    #create(service: Service, type: SubscriptionType, symbol: string, created: Entry[]): OwnEntry {
        const entry: OwnEntry = {
            key: subscriptionKey(service, type, symbol),
            service,
            type,
            symbol,
            subscribers: new Set(),
            refs: 0,
            dependents: new Set(),
            dependencies: [],
            clientId: undefined,
            status: "pending",
            error: undefined,
            response: undefined,
            markets: new Set(),
        };
        this.#entries.set(entry.key, entry);
        let bySymbol = this.#entriesBySymbol.get(symbol);
        if (!bySymbol) {
            this.#entriesBySymbol.set(symbol, (bySymbol = new Set()));
        }
        bySymbol.add(entry);

        // CV is seeded by its own snapshot, then built from trades, which arrive on the symbol's ALL subscription: the
        // same entry a quote subscription on REAL_TIME uses, so a quote and a CV on one symbol share it
        if (type === SubscriptionType.CUMULATIVE_VOLUME) {
            const all = this.#acquire(Service.REAL_TIME, SubscriptionType.ALL, symbol, created);
            all.dependents.add(entry);
            entry.dependencies.push(all);
        }

        this.#send(entry);
        created.push(entry);
        return entry;
    }

    #send(entry: OwnEntry) {
        if (!this.#client) {
            return;
        }
        entry.clientId = this.#client.subscribe(entry.service, entry.type, 0, [entry.symbol], null, null, null);
    }

    /** Deletes the entry and removes its dependencies' references, which can remove those too; collects them in `removed`. */
    #delete(entry: OwnEntry, removed: Entry[]) {
        this.#entries.delete(entry.key);
        const bySymbol = this.#entriesBySymbol.get(entry.symbol);
        if (bySymbol?.delete(entry) && bySymbol.size === 0) {
            this.#entriesBySymbol.delete(entry.symbol);
        }
        // out of the market index; `entry.markets` stays, so the caller can see what the removed entry named
        for (const marketId of entry.markets) {
            const entries = this.#entriesByMarket.get(marketId);
            if (entries?.delete(entry) && entries.size === 0) {
                this.#entriesByMarket.delete(marketId);
            }
        }
        removed.push(entry);
        if (this.#client && entry.clientId) {
            try {
                this.#client.unsubscribe(entry.clientId);
            } catch (e) {
                // the client throws for ids it doesn't know (Part D)
                this.log.warn("OF SDK > Unsubscribe failed", entry.key, e);
            }
        }
        for (const dependency of entry.dependencies) {
            dependency.dependents.delete(entry);
            removed.push(...this.remove(dependency));
        }
    }
}
