import { BestBidOfferView } from "./formatted-best-bid-offer";
import { SessionView } from "./formatted-session";
import type { FormattedGroup } from "./formatted-view";
import type { Instrument } from "./instrument";
import type { BestBidOfferRecord, QuoteRecord, SessionRecord } from "./reducers/quote";

/**
 * A session's prices and quantities as strings, with the same field names as {@link SessionRecord}; `""` for a field
 * that isn't set. Prices are in the instrument's own notation, and in decimal notation under `decimal`. `values` has
 * every field as one plain object.
 *
 * @example
 * ```ts
 * formatted.session.last; // "112-16"
 * formatted.session.decimal.last; // "112.50000"
 * formatted.session.volume; // "1,234"
 * ```
 */
export type FormattedSession = FormattedGroup<SessionRecord>;

/**
 * The best bid and offer as strings, with the same field names as {@link BestBidOfferRecord}; `""` for a field that
 * isn't set. Prices are in the instrument's own notation, and in decimal notation under `decimal`. `values` has every
 * field as one plain object.
 */
export type FormattedBestBidOffer = FormattedGroup<BestBidOfferRecord>;

/**
 * A quote as strings, in the record's groups: each session and the best bid and offer, each with its native and
 * `decimal` notation; quantities with thousands separators in both. The status and dates stay on the record:
 * formatting dates takes a time zone and a locale. `JSON.stringify` gives every group's values.
 */
export interface FormattedQuote {
    /** The current session. */
    readonly session: FormattedSession;
    /** The session before it. */
    readonly previousSession: FormattedSession;
    /** The best bid and offer. */
    readonly bestBidOffer: FormattedBestBidOffer;
}

/** The quote's groups, each built on its first read. */
class QuoteView implements FormattedQuote {
    #session: SessionView | undefined;
    #previousSession: SessionView | undefined;
    #bestBidOffer: BestBidOfferView | undefined;

    constructor(
        private readonly quote: QuoteRecord,
        private readonly instrument: Instrument
    ) {}

    get session(): FormattedSession {
        return (this.#session ??= new SessionView(this.quote.session, this.instrument, "native"));
    }

    get previousSession(): FormattedSession {
        return (this.#previousSession ??= new SessionView(this.quote.previousSession, this.instrument, "native"));
    }

    get bestBidOffer(): FormattedBestBidOffer {
        return (this.#bestBidOffer ??= new BestBidOfferView(this.quote.bestBidOffer, this.instrument, "native"));
    }

    toJSON(): object {
        return { session: this.session, previousSession: this.previousSession, bestBidOffer: this.bestBidOffer };
    }
}

export const formatQuote = (quote: QuoteRecord, instrument: Instrument): FormattedQuote => new QuoteView(quote, instrument);
