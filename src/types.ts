import type {
    HeartBeat,
    InstrumentDefinition,
    MarketSnapshot,
    MarketUpdate,
    OpenFeedInstrumentRequest,
    OpenfeedGatewayMessage,
    OpenfeedRequest,
    Result,
    Service,
    SubscriptionResponse,
    SubscriptionType,
} from "@openfeed/sdk-js";
import type Long from "long";
import type { FormattedQuote } from "./formatted-quote";
import type { Instrument } from "./instrument";
import type { Book } from "./reducers/book";
import type { QuoteRecord } from "./reducers/quote";

/**
 * `credentials-rejected` lasts until the next `login` or `logout`.
 * `logout` returns to `logged-out` from any state.
 */
export type ConnectionState = "logged-out" | "connecting" | "connected" | "disconnected" | "credentials-rejected";

export interface Credentials {
    readonly url: string;
    readonly username: string;
    readonly password: string;
}

export interface SdkLogger {
    log(...data: unknown[]): void;
    warn(...data: unknown[]): void;
    error(...data: unknown[]): void;
}

/** `pending` until the server answers, and again after each logout until the next login's answer. */
export type SubscriptionState = "pending" | "active" | "error" | "closed";

/**
 * What a subscriber holds. Closing it is the only way to give up the subscription.
 * After `subscribe` returns, the subscription loop delivers the current state as one `initial` event (or a stored
 * error to `onError`); events report changes from then on.
 */
export interface Subscription {
    readonly state: SubscriptionState;
    /** The server's refusal, if the subscription is in `error` (also one stored from an earlier subscriber). */
    readonly error: SubscriptionError | undefined;
    /** Idempotent; no callbacks arrive after it returns. */
    close(): void;
}

/** A subscription the server refused. `result` is the proto's own Result value. */
export class SubscriptionError extends Error {
    constructor(
        readonly result: Result,
        readonly symbol: string,
        readonly type: SubscriptionType,
        message: string
    ) {
        super(message);
        this.name = "SubscriptionError";
    }
}

export interface Listener<E> {
    /** Optional: a subscriber may only want what the subscription holds, or only its raw messages (`onMessage`). */
    onEvent?(event: E): void;
    onError?(error: SubscriptionError): void;
    /**
     * Optional: also every raw message for the subscription's instrument, as a raw subscription gets it (responses,
     * and every message for the instruments its responses named), after the SDK applied it and after `onEvent`.
     * For a consumer that needs the state and the raw stream from one subscription, such as a chart.
     */
    onMessage?(message: OpenfeedGatewayMessage, metadata: MessageMetadata): void;
}

/** What the JS client knows about a message beyond the protocol: its symbol names and the market's definition. */
export interface MessageMetadata {
    readonly symbolNames: readonly string[];
    readonly definition: InstrumentDefinition | undefined;
}

/** A gateway heartbeat: its server time (null when the heartbeat carries none) and the protocol message. */
export type HeartbeatListener = (serverTime: Date | null, raw: HeartBeat) => void;

/** Gets the subscription's responses and every message for the markets those responses named. */
export interface RawListener {
    onMessage(message: OpenfeedGatewayMessage, metadata: MessageMetadata): void;
    onError?(error: SubscriptionError): void;
}

/**
 * - `initial`: the current state, delivered once to a new subscriber after `subscribe` returned; `raw` is the
 *   instrument's last snapshot message.
 * - `snapshot` / `update`: a message from the wire was just applied; `raw` is that message.
 */
export type EventKind = "initial" | "snapshot" | "update";

/** What every event carries. Exported for the SDK's own use; index.ts doesn't re-export it. */
export interface EventBase {
    readonly symbol: string;
    readonly instrument: Instrument;
    readonly kind: EventKind;
    readonly raw: OpenfeedGatewayMessage;
}

export interface QuoteEvent extends EventBase {
    readonly quote: QuoteRecord;
    /**
     * The same quote as strings, formatted when read: `formatted.session.last` → "112-16",
     * `formatted.session.decimal.last` → "112.50000".
     */
    readonly formatted: FormattedQuote;
}

export interface BookEvent extends EventBase {
    /** The whole book, the same object as getBook. */
    readonly book: Book;
}

export interface CumulativeVolumeEvent extends EventBase {
    /** Every level, ascending by price: the same array as getCumulativeVolume. A snapshot starts them over. */
    readonly levels: readonly PriceVolume[];
    /**
     * The levels this message changed, each price once with its new volume, ascending. On `initial` and `snapshot`
     * the levels start over, so it's every level and any other level a consumer kept is gone.
     */
    readonly changed: readonly PriceVolume[];
}

export interface PriceVolume {
    readonly price: number;
    readonly volume: number;
}

export interface LastMessages {
    readonly snapshot: MarketSnapshot | undefined;
    readonly update: MarketUpdate | undefined;
}

/** One registry entry, for diagnostics. */
export interface SubscriptionInfo {
    readonly service: Service;
    readonly type: SubscriptionType;
    readonly symbol: string;
    readonly state: Exclude<SubscriptionState, "closed">;
    readonly subscribers: number;
    readonly error: SubscriptionError | undefined;
    readonly response: SubscriptionResponse | undefined;
}

/** What `requestSnapshot` resolves with: the shape `getSnapshot` has always returned. */
export interface SnapshotMessage {
    readonly instrumentDefinition: InstrumentDefinition | undefined;
    readonly marketSnapshot: MarketSnapshot;
}

/** `sdk.raw`: protocol-level access, for what the SDK doesn't model. */
export interface RawAccess {
    /**
     * A wire subscription without SDK state or events (UDS roots, say). The listener gets the subscription's
     * responses and every message for the markets those responses named.
     */
    subscribe(symbol: string, type: SubscriptionType, listener?: RawListener, service?: Service): Subscription;
    /** A one-off snapshot: resolves with the definition and the first snapshot, then closes. Rejects on an error. */
    requestSnapshot(symbol: string, service?: Service): Promise<SnapshotMessage>;
    /** Every incoming message, after the SDK applied it. Meant for the Desktop proxy, which forwards everything. */
    onMessage(listener: (message: OpenfeedGatewayMessage, metadata: MessageMetadata) => void): () => void;
    /** Sends a request the SDK doesn't model. Returns the correlation id, or undefined when not connected. */
    send(request: OpenfeedRequest, correlationId?: Long): Long | undefined;
    /** The gateway's instrument lookup, with the protocol's request and definitions; waits for the connection. */
    lookupInstruments(request: OpenFeedInstrumentRequest): Promise<InstrumentDefinition[]>;
}

/** `sdk.diagnostics`: what support and debugging need, not trading. */
export interface Diagnostics {
    /** The gateway's session token; undefined while not connected. */
    getConnectionToken(): string | undefined;
    /** The market's last snapshot and last applied update. */
    getLastMessages(symbol: string): LastMessages | undefined;
    /** Every subscription entry: its key, state, subscriber count, error and last response. */
    getSubscriptionInfo(): SubscriptionInfo[];
}
