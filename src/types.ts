import {
    type HeartBeat,
    type InstrumentDefinition,
    type MarketSnapshot,
    type MarketUpdate,
    type OpenFeedInstrumentRequest,
    type OpenfeedGatewayMessage,
    type OpenfeedRequest,
    Result,
    Service,
    type SubscriptionResponse,
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

/** What `sdk.login` connects with. */
export interface Credentials {
    /** The Openfeed server's WebSocket URL, such as `ws://localhost:9000` for the Barchart Desktop API. */
    readonly url: string;
    /** The username to log in with. */
    readonly username: string;
    /** The password to log in with. */
    readonly password: string;
}

/** Where the SDK and the Openfeed client log. `console` is one. */
export interface SdkLogger {
    /** Routine messages, such as the subscriptions sent at login. */
    log(...data: unknown[]): void;
    /** Something unexpected that the SDK handled, such as an unknown price format. */
    warn(...data: unknown[]): void;
    /** A failure, such as a message the SDK couldn't apply. */
    error(...data: unknown[]): void;
}

/** `pending` until the server answers, and again after each logout until the next login's answer. */
export type SubscriptionState = "pending" | "active" | "error" | "closed";

/**
 * What a subscribe method returns. Closing it is the only way to give up the subscription.
 * After `subscribe` returns, the listener gets the current state as one `initial` event (or a stored error through
 * `onError`); events report changes from then on.
 */
export interface Subscription {
    /**
     * Where the subscription stands: `pending` until the server answers, then `active` or `error`; `closed` once
     * closed.
     */
    readonly state: SubscriptionState;
    /** The server's refusal, if the subscription is in `error` (also one stored from an earlier subscriber). */
    readonly error: SubscriptionError | undefined;
    /** Idempotent; no callbacks arrive after it returns. */
    close(): void;
}

/** An enum value's name; a value newer than this copy of the protocol types has none, so it stays a number. */
const getEnumName = (names: Readonly<Record<number, string | undefined>>, value: number): string => names[value] ?? String(value);

const getErrorMessage = (
    result: Result,
    symbol: string,
    type: SubscriptionType,
    service: Service,
    serverMessage: string,
    requiredBy?: SubscriptionType
) => {
    const requirement = requiredBy === undefined ? "" : `, which ${getEnumName(SubscriptionType, requiredBy)} needs,`;
    const refusal = `${getEnumName(Result, result)}: ${getEnumName(SubscriptionType, type)} on ${symbol} (${getEnumName(Service, service)})${requirement} was refused.`;
    return serverMessage ? `${refusal} Server said: "${serverMessage}"` : refusal;
};

/**
 * A subscription the server refused. `message` says what was refused and ends with the server's own text, which is
 * kept as it came in `serverMessage`. The message is for reading; code should decide on `result`, Openfeed's
 * `Result` value.
 *
 * @example
 * ```ts
 * error.message; // 'INSUFFICIENT_PRIVILEGES: DEPTH_PRICE on ESZ26 (REAL_TIME) was refused. Server said: "…"'
 * ```
 */
export class SubscriptionError extends Error {
    /** Created by the SDK, which passes it to `onError`; an application has no need to create one. */
    constructor(
        /** Openfeed's result code for the refusal. Decide on this, not on the message's text. */
        readonly result: Result,
        /** The symbol the subscription asked for. */
        readonly symbol: string,
        /** The subscription the server refused. */
        readonly type: SubscriptionType,
        /** The service that subscription asked for. */
        readonly service: Service,
        /** The server's own text, as it came; empty if it sent none. */
        readonly serverMessage: string,
        /**
         * Set when the refused subscription is one that the subscriber's own type depends on: on a cumulative volume
         * subscriber's error, `CUMULATIVE_VOLUME`, with `type` being the `ALL` it holds. Otherwise `undefined`.
         */
        readonly requiredBy?: SubscriptionType
    ) {
        super(getErrorMessage(result, symbol, type, service, serverMessage, requiredBy));
        this.name = "SubscriptionError";
    }
}

/**
 * What a subscribe method calls. Every callback is optional. None is called inside `subscribe`, and none after the
 * subscription's `close()` returns.
 *
 * @typeParam E - The subscription's event: {@link QuoteEvent}, {@link BookEvent} or {@link CumulativeVolumeEvent}.
 */
export interface Listener<E> {
    /**
     * Each event: the current state once (`initial`), then every change. Leave it out to only hold the subscription,
     * or to only use `onMessage`.
     */
    onEvent?(event: E): void;
    /** The server refused the subscription; the subscription is then in `error`. */
    onError?(error: SubscriptionError): void;
    /**
     * Optional: also every raw message for the subscription's instrument, as a raw subscription gets it (responses,
     * and every message for the instruments its responses named), after the SDK applied it and after `onEvent`.
     * For a consumer that needs the state and the raw stream from one subscription, such as a chart.
     */
    onMessage?(message: OpenfeedGatewayMessage, metadata: MessageMetadata): void;
}

/** What the Openfeed client knows about a message beyond the protocol: its symbol names and the market's definition. */
export interface MessageMetadata {
    /** The names the message's instrument was subscribed under. */
    readonly symbolNames: readonly string[];
    /** The instrument's definition, if the client has it. */
    readonly definition: InstrumentDefinition | undefined;
}

/** A gateway heartbeat: its server time (null when the heartbeat carries none) and the protocol message. */
export type HeartbeatListener = (serverTime: Date | null, raw: HeartBeat) => void;

/** Gets the subscription's responses and every message for the markets those responses named. */
export interface RawListener {
    /** Each message, with what the Openfeed client knows about it. */
    onMessage(message: OpenfeedGatewayMessage, metadata: MessageMetadata): void;
    /** The server refused the subscription; the subscription is then in `error`. */
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
    /** The symbol as subscribed, an alias such as `ZC*1` included. */
    readonly symbol: string;
    /** The instrument the symbol stands for; after an alias rolls, the new contract. */
    readonly instrument: Instrument;
    /** Why the event came: the current state for a new subscriber, or a message just applied. */
    readonly kind: EventKind;
    /** The message behind the event: the one just applied, or for `initial` the instrument's last snapshot. */
    readonly raw: OpenfeedGatewayMessage;
}

/** What `subscribeQuote`'s listener gets: the quote as numbers and as strings. */
export interface QuoteEvent extends EventBase {
    /** The whole quote, the same object as getQuote. */
    readonly quote: QuoteRecord;
    /**
     * The same quote as strings, formatted when read: `formatted.session.last` → "112-16",
     * `formatted.session.decimal.last` → "112.50000".
     */
    readonly formatted: FormattedQuote;
}

/** What `subscribeDepth`'s listener gets. */
export interface BookEvent extends EventBase {
    /** The whole book, the same object as getBook. */
    readonly book: Book;
}

/** What `subscribeCumulativeVolume`'s listener gets: every level, and the ones this message changed. */
export interface CumulativeVolumeEvent extends EventBase {
    /** Every level, ascending by price: the same array as getCumulativeVolume. A snapshot starts them over. */
    readonly levels: readonly PriceVolume[];
    /**
     * The levels this message changed, each price once with its new volume, ascending. On `initial` and `snapshot`
     * the levels start over, so it's every level and any other level a consumer kept is gone.
     */
    readonly changed: readonly PriceVolume[];
}

/** The volume traded at one price. */
export interface PriceVolume {
    /** The price traded at. */
    readonly price: number;
    /** The total traded at `price` so far. */
    readonly volume: number;
}

/** What `diagnostics.getLastMessages` returns: the market's last messages, as they came. */
export interface LastMessages {
    /** The last snapshot applied; `undefined` before the first. */
    readonly snapshot: MarketSnapshot | undefined;
    /** The last update applied; `undefined` before the first. */
    readonly update: MarketUpdate | undefined;
}

/**
 * One Openfeed subscription the SDK holds, for diagnostics. Subscribers with the same symbol, type and service share
 * one.
 */
export interface SubscriptionInfo {
    /** The Openfeed service it was made on. */
    readonly service: Service;
    /** The Openfeed subscription type, such as `ALL` for quotes. */
    readonly type: SubscriptionType;
    /** The symbol as subscribed. */
    readonly symbol: string;
    /** Where it stands: `pending`, `active` or `error`. */
    readonly state: Exclude<SubscriptionState, "closed">;
    /** How many subscriptions share it. */
    readonly subscribers: number;
    /** The server's refusal, while in `error`. */
    readonly error: SubscriptionError | undefined;
    /** The server's last answer; `undefined` until it answers. */
    readonly response: SubscriptionResponse | undefined;
}

/** What `raw.requestSnapshot` resolves with. */
export interface SnapshotMessage {
    /** The instrument's definition, if the server sent one. */
    readonly instrumentDefinition: InstrumentDefinition | undefined;
    /** The snapshot: the market's state when the server sent it. */
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
