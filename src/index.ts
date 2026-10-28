// The public API (docs/reference.md). Everything else in src/ (store, registry, subscribers) is internal.

export { DesktopSdk } from "./desktop-sdk";
export type { DesktopSdkOptions } from "./desktop-sdk";
export { SubscriptionError } from "./types";
export type {
    BookEvent,
    ConnectionState,
    Credentials,
    CumulativeVolumeEvent,
    Diagnostics,
    EventKind,
    HeartbeatListener,
    LastMessages,
    Listener,
    MessageMetadata,
    PriceVolume,
    QuoteEvent,
    RawAccess,
    RawListener,
    SdkLogger,
    SnapshotMessage,
    Subscription,
    SubscriptionInfo,
    SubscriptionState,
} from "./types";

// The state the SDK hands out.
export type { Instrument, PriceNotation } from "./instrument";
export type { FormattedBestBidOffer, FormattedQuote, FormattedSession } from "./formatted-quote";
export { formatDecimal, formatPrice } from "./price-format";
export type { PriceFormat } from "./price-format";
export { TradeDate } from "./trade-date";
export type { BestBidOfferRecord, QuoteRecord, SessionRecord, StatusRecord } from "./reducers/quote";
export type { Book, PriceLevel } from "./reducers/book";
