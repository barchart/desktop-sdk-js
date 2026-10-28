import {
    ActionType,
    type HeartBeat,
    type InstrumentAction,
    type InstrumentDefinition,
    type IOpenFeedConnection,
    OpenFeedClient,
    type OpenfeedGatewayMessage,
    OpenFeedListeners,
    Service,
    SubscriptionType,
} from "@openfeed/sdk-js";
import { formatQuote, type FormattedQuote } from "./formatted-quote";
import type { Instrument } from "./instrument";
import { InstrumentStore, type InstrumentChange, type StateParts } from "./instrument-store";
import type { Book } from "./reducers/book";
import { toTime, type QuoteRecord } from "./reducers/quote";
import { getMessageMarketId, getWireLabels, Registry, type Entry } from "./registry";
import { ResolutionSource } from "./resolution-source";
import { getMessageSubscribers, getSubscriberError, Subscriber, type Method } from "./subscriber";
import type {
    BookEvent,
    ConnectionState,
    Credentials,
    CumulativeVolumeEvent,
    Diagnostics,
    EventBase,
    HeartbeatListener,
    Listener,
    MessageMetadata,
    PriceVolume,
    QuoteEvent,
    RawAccess,
    SdkLogger,
    SnapshotMessage,
    Subscription,
} from "./types";

export interface DesktopSdkOptions {
    readonly logger?: SdkLogger;
    /**
     * Holds subscription events for up to this many milliseconds, then delivers one per subscription with the latest
     * state, instead of one per message. Unset or 0: an event per message.
     */
    readonly coalesceIntervalMs?: number;
}

/** A change held for the next delivery (coalesceIntervalMs), with the last message behind it. */
interface HeldChange {
    readonly change: InstrumentChange;
    readonly raw: OpenfeedGatewayMessage;
}

interface Waiter {
    resolve(): void;
    reject(error: Error): void;
}

/** A request for the subscription loop. */
type Op = { readonly kind: "subscribe"; readonly subscriber: Subscriber } | { readonly kind: "close"; readonly subscriber: Subscriber };

const delay = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * One subscriber's event: its method's part, if there is one (a change carries only the parts it changed; a first
 * delivery, every part there is). Raw subscribers get no events.
 */
const emitTo = (subscriber: Subscriber, base: EventBase, parts: StateParts) => {
    const { listener } = subscriber;
    if (subscriber.method === "raw" || !listener || !("onEvent" in listener)) {
        return;
    }
    const part = parts[subscriber.method];
    if (part) {
        const event = { ...base, ...part };
        subscriber.call(() => listener.onEvent?.(event));
    }
};

/** Raw subscribers, and state subscribers whose listener takes messages too (`onMessage`). */
const deliverRaw = (subscribers: Subscriber[], message: OpenfeedGatewayMessage, metadata: MessageMetadata) => {
    for (const subscriber of subscribers) {
        subscriber.call(() => subscriber.listener?.onMessage?.(message, metadata));
    }
};

const mergeCumulativeVolume = (
    earlier: StateParts["cumulativeVolume"],
    later: StateParts["cumulativeVolume"],
    kind: InstrumentChange["kind"]
): StateParts["cumulativeVolume"] => {
    if (!earlier || !later) {
        return later ?? earlier;
    }
    // a snapshot started the levels over, so every level is a change, as on a snapshot event
    if (kind === "snapshot") {
        return { levels: later.levels, changed: later.levels };
    }
    const changed = new Map(earlier.changed.map((level) => [level.price, level]));
    for (const level of later.changed) {
        changed.set(level.price, level);
    }
    return { levels: later.levels, changed: Object.freeze([...changed.values()].sort((a, b) => a.price - b.price)) };
};

/**
 * Two changes to one market as one: each part is the later one's, if it has it. It's a snapshot if either was, since
 * a snapshot starts the market over; cumulative volume's changed levels add up.
 */
const mergeChanges = (earlier: InstrumentChange, later: InstrumentChange): InstrumentChange => {
    const kind = earlier.kind === "snapshot" || later.kind === "snapshot" ? "snapshot" : "update";
    return {
        marketId: later.marketId,
        kind,
        parts: {
            quote: later.parts.quote ?? earlier.parts.quote,
            depth: later.parts.depth ?? earlier.parts.depth,
            cumulativeVolume: mergeCumulativeVolume(earlier.parts.cumulativeVolume, later.parts.cumulativeVolume, kind),
        },
    };
};

/**
 * The Desktop SDK: Openfeed messages turned into quote, book and cumulative volume state (docs/design.md).
 *
 * One object for the app's lifetime; login is a state of it. Each `login` creates an Openfeed client, and `logout`
 * disposes it and clears market state. Subscriptions are desired state: they stay across logins, and every login
 * sends them again.
 *
 * Subscriptions go through one loop: `subscribe` and `close()` only queue a request, and the loop processes
 * everything queued so far as one batch, after the calling code has finished (see #process). Keep the loop to
 * registrations only: messages and retries never go through it.
 */
export class DesktopSdk {
    readonly #log: SdkLogger;
    readonly #store: InstrumentStore;
    readonly #registry: Registry;
    readonly #coalesceIntervalMs: number;

    // coalescing: changes held since the last delivery, by market, and the signal that wakes the delivery loop
    readonly #held = new Map<string, HeldChange>();
    #heldUpdated = new ResolutionSource<void>();

    #state: ConnectionState = "logged-out";
    #client: OpenFeedClient | undefined;
    #connection: IOpenFeedConnection | undefined;
    #disposed = false;

    readonly #stateListeners = new Set<(state: ConnectionState) => void>();
    readonly #heartbeatListeners = new Set<HeartbeatListener>();
    readonly #rawListeners = new Set<(message: OpenfeedGatewayMessage, metadata: MessageMetadata) => void>();
    readonly #removedListeners = new Set<(symbol: string) => void>();
    #waiters: Waiter[] = [];
    /** `raw.requestSnapshot` calls still waiting for their snapshot. */
    readonly #snapshotRequests = new Set<ResolutionSource<SnapshotMessage>>();

    // the subscription loop: requests queued since the last batch, and the signal that wakes the loop
    #queue: Op[] = [];
    #queueUpdated = new ResolutionSource<void>();

    /** Protocol-level access: raw subscriptions, snapshots, messages and requests. */
    readonly raw: RawAccess = Object.freeze<RawAccess>({
        subscribe: (symbol, type, listener, service = Service.REAL_TIME) => this.#subscribe(service, type, symbol, "raw", listener),
        requestSnapshot: (symbol, service = Service.REAL_TIME_SNAPSHOT) => this.#requestSnapshot(symbol, service),
        onMessage: (listener) => {
            this.#rawListeners.add(listener);
            return () => void this.#rawListeners.delete(listener);
        },
        send: (request, correlationId) => this.#connection?.send(request, correlationId),
        lookupInstruments: async (request) => {
            await this.whenConnected();
            // the connection can drop between whenConnected resolving and this continuation
            if (!this.#connection) {
                throw new Error("The Desktop SDK is not connected");
            }
            return this.#connection.getInstrument(request);
        },
    });

    /** What support and debugging need. */
    readonly diagnostics: Diagnostics = Object.freeze<Diagnostics>({
        getConnectionToken: () => (this.#connection as { connectionToken?: string } | undefined)?.connectionToken,
        getLastMessages: (symbol) => this.#store.getLastMessagesById(this.#marketIdOf(symbol)),
        getSubscriptionInfo: () =>
            [...this.#registry.getAllEntries()].map((e) => ({
                service: e.service,
                type: e.type,
                symbol: e.symbol,
                state: e.status,
                subscribers: e.subscribers.size,
                error: e.error,
                response: e.response,
            })),
    });

    constructor(options: DesktopSdkOptions = {}) {
        this.#log = options.logger ?? console;
        this.#coalesceIntervalMs = options.coalesceIntervalMs ?? 0;
        this.#registry = new Registry(this.#log);
        this.#store = new InstrumentStore(this.#log);
        void this.#runLoop();
        if (this.#coalesceIntervalMs > 0) {
            void this.#runDeliveryLoop();
        }
    }

    // ---- lifetime ----

    get connectionState(): ConnectionState {
        return this.#state;
    }

    /** Logs in, creating an Openfeed client; logs out first when already logged in. Every open subscription is sent. */
    login(credentials: Credentials) {
        this.#assertNotDisposed();
        this.logout();

        // set once the client exists; its listeners are never called before that
        let client: OpenFeedClient | null = null;
        const listeners = new OpenFeedListeners();
        const isCurrent = () => client !== null && this.#client === client;

        listeners.onConnected = (connection) => {
            if (!isCurrent()) {
                return;
            }
            this.#connection = connection;
            this.#setState("connected");
        };
        listeners.onDisconnected = () => {
            if (!isCurrent()) {
                return;
            }
            this.#connection = undefined;
            this.#setState("disconnected");
        };
        listeners.onCredentialsRejected = () => {
            if (!isCurrent()) {
                return;
            }
            // the client has stopped: its ids are useless and unsubscribing would throw
            this.#connection = undefined;
            this.#registry.detach();
            this.#store.clear();
            // the state they describe is gone
            this.#held.clear();
            this.#setState("credentials-rejected");
        };
        // the listeners' parameters are typed here: @openfeed/sdk-js's own declarations import them through a path
        // alias that doesn't resolve in an installed package, which leaves them `any`
        listeners.onHeartBeat = (heartbeat: HeartBeat) => {
            if (!isCurrent()) {
                return;
            }
            const serverTime = toTime(heartbeat.transactionTime);
            for (const listener of [...this.#heartbeatListeners]) {
                this.#call(() => {
                    listener(serverTime, heartbeat);
                });
            }
        };
        listeners.onMessageWithMetadata = (message: OpenfeedGatewayMessage, symbolNames: string[], definition?: InstrumentDefinition) => {
            if (!isCurrent()) {
                return;
            }
            this.#onMessage(message, { symbolNames, definition });
        };

        client = new OpenFeedClient(credentials.url, credentials.username, credentials.password, listeners, this.#log);
        this.#client = client;
        this.#setState("connecting");
        this.#registry.attach(client);
        const subscribes = getWireLabels(this.#registry.getAllEntries());
        if (subscribes) {
            this.#log.log("OF SDK > Subscribing to", subscribes);
        }
    }

    /** Disposes the client and clears market state. Subscriptions stay, as `pending`, for the next login. */
    logout() {
        const client = this.#client;
        if (!client) {
            return;
        }
        this.#client = undefined;
        this.#connection = undefined;
        this.#registry.detach();
        client.dispose();
        this.#store.clear();
        // the state they describe is gone
        this.#held.clear();
        this.#setState("logged-out");
    }

    /** Logs out, closes every subscription and removes every listener. */
    dispose() {
        if (this.#disposed) {
            return;
        }
        this.logout();
        this.#disposed = true;
        // never processed, so not in the registry
        for (const op of this.#queue) {
            op.subscriber.closed = true;
        }
        this.#queue = [];
        // lets the loops see #disposed and end
        this.#queueUpdated.resolve();
        this.#heldUpdated.resolve();
        this.#registry.clear();
        this.#rejectWaiters(new Error("The Desktop SDK was disposed"));
        for (const request of this.#snapshotRequests) {
            request.reject(new Error("The Desktop SDK was disposed"));
        }
        this.#snapshotRequests.clear();
        this.#stateListeners.clear();
        this.#heartbeatListeners.clear();
        this.#rawListeners.clear();
        this.#removedListeners.clear();
    }

    onConnectionState(listener: (state: ConnectionState) => void): () => void {
        this.#stateListeners.add(listener);
        return () => this.#stateListeners.delete(listener);
    }

    /** Each heartbeat from the gateway: its server time (null if unset), and the protocol message. */
    onHeartbeat(listener: HeartbeatListener): () => void {
        this.#heartbeatListeners.add(listener);
        return () => this.#heartbeatListeners.delete(listener);
    }

    /**
     * A symbol is no longer subscribed (see isSubscribed), because the subscriptions that had it closed. Reported by the
     * subscription loop after a batch's closes. Logout removes everything and reports `logged-out` instead.
     */
    onRemoved(listener: (symbol: string) => void): () => void {
        this.#removedListeners.add(listener);
        return () => this.#removedListeners.delete(listener);
    }

    /**
     * Whether the symbol is subscribed: a state subscription linked to its instrument, or an entry whose successful
     * responses named its instrument (raw subscriptions, such as a UDS root with its instruments). The store may still
     * have state for a symbol that isn't subscribed (a stray definition), so getQuote can answer when this is false.
     */
    isSubscribed(symbol: string): boolean {
        const marketId = this.#marketIdOf(symbol);
        return marketId !== undefined && this.#registry.hasId(marketId);
    }

    /** Resolves once connected, waiting for a login if needed; rejects on rejected credentials or dispose. */
    whenConnected(): Promise<void> {
        if (this.#disposed) {
            return Promise.reject(new Error("The Desktop SDK was disposed"));
        }
        if (this.#state === "connected") {
            return Promise.resolve();
        }
        return new Promise((resolve, reject) => {
            this.#waiters.push({ resolve, reject });
        });
    }

    // ---- subscriptions ----

    subscribeQuote(symbol: string, listener: Listener<QuoteEvent>, service = Service.REAL_TIME): Subscription {
        return this.#subscribe(service, SubscriptionType.ALL, symbol, "quote", listener);
    }

    subscribeDepth(symbol: string, listener: Listener<BookEvent>, service = Service.REAL_TIME): Subscription {
        return this.#subscribe(service, SubscriptionType.DEPTH_PRICE, symbol, "depth", listener);
    }

    /** On REAL_TIME_SNAPSHOT by default. Also holds the symbol's ALL on REAL_TIME, whose trades update CV. */
    subscribeCumulativeVolume(symbol: string, listener: Listener<CumulativeVolumeEvent>, service = Service.REAL_TIME_SNAPSHOT): Subscription {
        return this.#subscribe(service, SubscriptionType.CUMULATIVE_VOLUME, symbol, "cumulativeVolume", listener);
    }

    // ---- state ----

    // A symbol is a subscribed name (aliases included) or an instrument's own symbol (#marketIdOf).

    getInstrument(symbol: string): Instrument | undefined {
        return this.#store.getInstrumentById(this.#marketIdOf(symbol));
    }

    getQuote(symbol: string): QuoteRecord | undefined {
        return this.#store.getQuoteById(this.#marketIdOf(symbol));
    }

    /** The current quote as strings, as a quote event's `formatted` carries them; undefined while there's no quote. */
    getFormattedQuote(symbol: string): FormattedQuote | undefined {
        const marketId = this.#marketIdOf(symbol);
        const quote = this.#store.getQuoteById(marketId);
        const instrument = this.#store.getInstrumentById(marketId);
        return quote && instrument ? formatQuote(quote, instrument) : undefined;
    }

    getBook(symbol: string): Book | undefined {
        return this.#store.getBookById(this.#marketIdOf(symbol));
    }

    /** Ascending by price; undefined until a snapshot brings volume at price. */
    getCumulativeVolume(symbol: string): readonly PriceVolume[] | undefined {
        return this.#store.getCumulativeVolumeById(this.#marketIdOf(symbol));
    }

    // ---- internals ----

    /**
     * `raw.requestSnapshot`: a raw ALL subscription, closed once the first snapshot (or an error) arrives. Still
     * pending at `dispose()`, it's rejected there.
     */
    #requestSnapshot(symbol: string, service: Service): Promise<SnapshotMessage> {
        if (this.#disposed) {
            return Promise.reject(new Error("The Desktop SDK was disposed"));
        }

        const request = new ResolutionSource<SnapshotMessage>();
        // set by the subscribe below, which never calls its listener before returning
        let subscription: Subscription | null = null;
        const settle = () => {
            this.#snapshotRequests.delete(request);
            subscription?.close();
        };
        subscription = this.raw.subscribe(
            symbol,
            SubscriptionType.ALL,
            {
                onMessage: (message, metadata) => {
                    const snapshot = message.marketSnapshot;
                    if (!snapshot) {
                        return;
                    }
                    settle();
                    request.resolve({
                        instrumentDefinition: metadata.definition ?? this.#store.getInstrumentById(snapshot.marketId.toString())?.definition,
                        marketSnapshot: snapshot,
                    });
                },
                onError: (error) => {
                    settle();
                    request.reject(error);
                },
            },
            service
        );
        this.#snapshotRequests.add(request);
        return request.whenCompleted;
    }

    #subscribe(service: Service, type: SubscriptionType, symbol: string, method: Method, listener: Subscriber["listener"]): Subscription {
        this.#assertNotDisposed();
        const subscriber = new Subscriber({ service, type, symbol }, method, listener, this.#log, (s) => {
            this.#enqueue({ kind: "close", subscriber: s });
        });
        this.#enqueue({ kind: "subscribe", subscriber });
        return subscriber.handle;
    }

    // ---- the subscription loop ----

    #enqueue(op: Op) {
        this.#queue.push(op);
        this.#queueUpdated.resolve();
    }

    /** Sleeps until something is queued, then processes everything queued so far as one batch. */
    async #runLoop() {
        while (!this.#disposed) {
            if (this.#queue.length === 0) {
                await this.#queueUpdated.whenCompleted;
                this.#queueUpdated = new ResolutionSource<void>();
            } else {
                this.#process(this.#queue.splice(0));
            }
        }
    }

    /**
     * One batch, always in this order:
     * 1. subscribes: each joins its entry (created, and sent when logged in, if it's new). A subscriber closed in the
     *    same batch is skipped, so a subscribe and close in one task never reach the registry or the wire;
     * 2. closes: each leaves its entry; at zero references the entry is unsubscribed and removed, and symbols left
     *    without a state subscription, or a dependency, lose their instrument. Symbols no subscription has any more
     *    are reported to onRemoved. Because subscribes come first, a remount (one subscriber closes, another
     *    subscribes to the same symbol) never takes the count to zero;
     * 3. first deliveries for the subscribers that opened: the entry's error, or the current state as an `initial`
     *    event. They come after `subscribe` returned: callers rely on holding the handle first.
     */
    #process(ops: Op[]) {
        const closed = new Set<Subscriber>();
        for (const op of ops) {
            if (op.kind === "close") {
                closed.add(op.subscriber);
            }
        }

        // the subscribes that open: all of the batch's, except those closed in the same batch
        const opened = ops.flatMap((op) => (op.kind === "subscribe" && !closed.has(op.subscriber) ? [op.subscriber] : []));
        const created: Entry[] = [];
        for (const subscriber of opened) {
            const { service, type, symbol } = subscriber.key;
            const entry = this.#registry.acquire(service, type, symbol, created);
            entry.subscribers.add(subscriber);
            subscriber.entry = entry;
        }

        // symbols that removed entries had: their own, and the own symbols of the instruments they named
        const maybeRemoved = new Set<string>();
        const removedEntries: Entry[] = [];
        for (const subscriber of closed) {
            // one closed in the batch it subscribed in never opened, and has no entry
            for (const removed of subscriber.entry ? this.#leave(subscriber, subscriber.entry) : []) {
                removedEntries.push(removed);
                maybeRemoved.add(removed.symbol);
                for (const marketId of removed.markets) {
                    // before its state may go
                    const own = this.#store.getInstrumentById(marketId)?.symbol;
                    if (own !== undefined) {
                        maybeRemoved.add(own);
                    }
                    this.#tryRemoveId(marketId);
                }
            }
        }
        for (const symbol of maybeRemoved) {
            if (!this.isSubscribed(symbol)) {
                for (const listener of [...this.#removedListeners]) {
                    this.#call(() => {
                        listener(symbol);
                    });
                }
            }
        }

        // what this batch sent: entries created or removed while logged in
        const subscribes = getWireLabels(created);
        if (subscribes) {
            this.#log.log("OF SDK > Subscribing to", subscribes);
        }
        const unsubscribes = getWireLabels(removedEntries);
        if (unsubscribes) {
            this.#log.log("OF SDK > Unsubscribing from", unsubscribes);
        }

        for (const subscriber of opened) {
            this.#deliverFirst(subscriber);
        }
    }

    /** A closing subscriber leaves its entry; returns the entries removed with it. */
    #leave(subscriber: Subscriber, entry: Entry): Entry[] {
        entry.subscribers.delete(subscriber);
        return this.#registry.remove(entry);
    }

    /** A subscribed symbol's market (the registry's), else the market whose definition has that symbol (the store's). */
    #marketIdOf(symbol: string): string | undefined {
        return this.#registry.getMarketId(symbol) ?? this.#store.getMarketId(symbol);
    }

    /**
     * The one place that decides a market's state goes: removed only once no subscription names it (a raw one, such
     * as a UDS root, keeps its instruments' state: its wire subscription stays open), so it may not succeed. Called
     * wherever an entry stops naming a market.
     */
    #tryRemoveId(marketId: string) {
        if (!this.#registry.hasId(marketId)) {
            this.#store.removeId(marketId);
        }
    }

    /**
     * A new subscriber's first delivery: the error it sees (getSubscriberError), or the instrument's current state as
     * one `initial` event (nothing for a raw subscriber, or before the instrument has state).
     */
    #deliverFirst(subscriber: Subscriber) {
        const { entry } = subscriber;
        if (subscriber.closed || !entry) {
            return;
        }
        const error = getSubscriberError(entry);
        if (error) {
            subscriber.fail(error);
            return;
        }

        const marketId = this.#marketIdOf(entry.symbol);
        const instrument = this.#store.getInstrumentById(marketId);
        const raw = this.#store.getLastSnapshotMessageById(marketId);
        if (!instrument || !raw) {
            return;
        }
        const base: EventBase = { symbol: entry.symbol, instrument, kind: "initial", raw };
        emitTo(subscriber, base, this.#store.getStatePartsById(marketId));
    }

    #onMessage(message: OpenfeedGatewayMessage, metadata: MessageMetadata) {
        if (message.subscriptionResponse) {
            for (const entry of this.#registry.onResponse(message.subscriptionResponse)) {
                deliverRaw(getMessageSubscribers(entry), message, metadata);
            }
        } else if (message.instrumentAction) {
            // subscribers of the old instrument get the action before their entries stop naming it
            const marketId = getMessageMarketId(message);
            if (marketId !== undefined) {
                deliverRaw(this.#registry.getMessageSubscribersById(marketId), message, metadata);
            }
            this.#onInstrumentAction(message.instrumentAction);
        } else {
            const change = this.#store.apply(message);
            if (change) {
                this.#deliverOrHold(change, message);
            }

            const marketId = getMessageMarketId(message);
            if (marketId !== undefined) {
                deliverRaw(this.#registry.getMessageSubscribersById(marketId), message, metadata);
            }
        }

        for (const listener of [...this.#rawListeners]) {
            this.#call(() => {
                listener(message, metadata);
            });
        }
    }

    /**
     * Alias rolls and exchange moves:
     * - ALIAS_CHANGED: the alias (e.g. `ZC*1`) stops naming the old instrument, so its subscribers stop getting the
     *   old instrument's messages and `getQuote(alias)` is undefined. The server then repeats the subscription
     *   response for the alias, which names the new instrument, followed by its definition and snapshot.
     * - EXCHANGE_MOVE: the instrument and its state move to the new marketId, and the entries that named it name the
     *   new one.
     * Other actions are ignored.
     */
    #onInstrumentAction(action: InstrumentAction) {
        const marketId = action.instrument?.marketId.toString();
        if (marketId === undefined) {
            return;
        }

        if (action.action === ActionType.ALIAS_CHANGED) {
            this.#registry.aliasChanged(action.oldAlias, marketId);
            this.#tryRemoveId(marketId);
        } else if (action.action === ActionType.EXCHANGE_MOVE) {
            const to = action.newInstrument?.marketId.toString();
            if (to === undefined) {
                return;
            }
            this.#store.moved(marketId, to);
            this.#registry.moved(marketId, to);
        }
    }

    /**
     * A change's events now, or, when coalescing, held with the market's earlier changes for the delivery loop.
     * Routing happens on delivery, so it follows the subscriptions open then.
     */
    #deliverOrHold(change: InstrumentChange, raw: OpenfeedGatewayMessage) {
        if (this.#coalesceIntervalMs <= 0) {
            this.#deliverChange(change, raw);
            return;
        }
        const held = this.#held.get(change.marketId);
        this.#held.set(change.marketId, { change: held ? mergeChanges(held.change, change) : change, raw });
        this.#heldUpdated.resolve();
    }

    /** Coalescing: sleeps until a change is held, waits out the interval, then delivers everything held by then. */
    async #runDeliveryLoop() {
        while (!this.#disposed) {
            if (this.#held.size === 0) {
                await this.#heldUpdated.whenCompleted;
                this.#heldUpdated = new ResolutionSource<void>();
            } else {
                await delay(this.#coalesceIntervalMs);
                const held = [...this.#held.values()];
                this.#held.clear();
                for (const { change, raw } of held) {
                    this.#deliverChange(change, raw);
                }
            }
        }
    }

    #deliverChange(change: InstrumentChange, raw: OpenfeedGatewayMessage) {
        const instrument = this.#store.getInstrumentById(change.marketId);
        if (!instrument) {
            return;
        }

        for (const symbol of this.#registry.getSymbolsById(change.marketId)) {
            for (const entry of this.#registry.getEntries(symbol)) {
                const base: EventBase = { symbol: entry.symbol, instrument, kind: change.kind, raw };
                for (const subscriber of [...entry.subscribers]) {
                    emitTo(subscriber, base, change.parts);
                }
            }
        }
    }

    #setState(state: ConnectionState) {
        if (this.#state === state) {
            return;
        }
        this.#state = state;
        if (state === "connected") {
            this.#resolveWaiters();
        }
        if (state === "credentials-rejected") {
            this.#rejectWaiters(new Error("Openfeed rejected the credentials"));
        }
        for (const listener of [...this.#stateListeners]) {
            this.#call(() => {
                listener(state);
            });
        }
    }

    #resolveWaiters() {
        const waiters = this.#waiters;
        this.#waiters = [];
        for (const waiter of waiters) {
            waiter.resolve();
        }
    }

    #rejectWaiters(error: Error) {
        const waiters = this.#waiters;
        this.#waiters = [];
        for (const waiter of waiters) {
            waiter.reject(error);
        }
    }

    #call(f: () => void) {
        try {
            f();
        } catch (e) {
            this.#log.error("OF SDK > A listener threw", e);
        }
    }

    #assertNotDisposed() {
        if (this.#disposed) {
            throw new Error("The Desktop SDK was disposed");
        }
    }
}
