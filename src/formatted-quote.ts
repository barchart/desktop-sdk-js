import { BestBidOfferView } from "./formatted-best-bid-offer";
import { SessionView } from "./formatted-session";
import type { FormattedGroup } from "./formatted-view";
import type { Instrument } from "./instrument";
import type { BestBidOfferRecord, QuoteRecord, SessionRecord } from "./reducers/quote";

export type FormattedSession = FormattedGroup<SessionRecord>;
export type FormattedBestBidOffer = FormattedGroup<BestBidOfferRecord>;

/**
 * A quote as strings, in the record's groups: each session and the best bid and offer, each with its native and
 * `decimal` notation; quantities with thousands separators in both. The status and dates stay on the record:
 * formatting dates takes a time zone and a locale. `JSON.stringify` gives every group's values.
 */
export interface FormattedQuote {
    readonly session: FormattedSession;
    readonly previousSession: FormattedSession;
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
