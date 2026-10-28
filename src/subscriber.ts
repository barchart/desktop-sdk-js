// Internal: one subscribe call, and what its subscribers see of their registry entry (registry.ts). Not exported from
// index.ts.
import type { Service, SubscriptionType } from "@openfeed/sdk-js";
import type { Entry } from "./registry";
import type {
    BookEvent,
    CumulativeVolumeEvent,
    Listener,
    QuoteEvent,
    RawListener,
    SdkLogger,
    Subscription,
    SubscriptionError,
    SubscriptionState,
} from "./types";

/** The key of one subscription, `service|type|symbol`: entries are keyed by it. */
export const subscriptionKey = (service: Service, type: SubscriptionType, symbol: string) => `${String(service)}|${String(type)}|${symbol}`;

/** Which events a subscriber gets; `raw` subscribers get messages instead. */
export type Method = "quote" | "depth" | "cumulativeVolume" | "raw";

/** What a subscriber asked for. */
interface EntryKey {
    readonly service: Service;
    readonly type: SubscriptionType;
    readonly symbol: string;
}

/**
 * The error an entry's subscribers see: its own, else a failed dependency's, since a CV doesn't update without its
 * ALL. Diagnostics show each entry's own.
 */
export const getSubscriberError = (entry: Entry): SubscriptionError | undefined =>
    entry.error ?? entry.dependencies.find((dependency) => dependency.error)?.error;

/** The state an entry's subscribers see: `error` when getSubscriberError has one, else the entry's own. */
export const getSubscriberState = (entry: Entry): Exclude<SubscriptionState, "closed"> => (getSubscriberError(entry) ? "error" : entry.status);

/** One subscribe call. Callers only ever see its frozen handle. */
export class Subscriber {
    closed = false;
    /** Set when the subscription loop processes the subscribe; until then the handle is `pending`. */
    entry: Entry | undefined;
    readonly handle: Subscription;

    constructor(
        readonly key: EntryKey,
        readonly method: Method,
        readonly listener: Listener<QuoteEvent | BookEvent | CumulativeVolumeEvent> | RawListener | undefined,
        private readonly log: SdkLogger,
        private readonly onClose: (subscriber: Subscriber) => void
    ) {
        // closures, so nothing on the handle reaches the entry or the reference count
        const state = (): SubscriptionState => {
            if (this.closed) {
                return "closed";
            }
            return this.entry ? getSubscriberState(this.entry) : "pending";
        };
        const error = () => (this.closed || !this.entry ? undefined : getSubscriberError(this.entry));
        this.handle = Object.freeze({
            get state() {
                return state();
            },
            get error() {
                return error();
            },
            close: () => {
                this.close();
            },
        });
    }

    close() {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.onClose(this);
    }

    /** Calls the listener, logging instead of throwing. */
    call(f: () => void) {
        if (this.closed) {
            return;
        }
        try {
            f();
        } catch (e) {
            const { service, type, symbol } = this.key;
            this.log.error("OF SDK > A subscription listener threw", subscriptionKey(service, type, symbol), e);
        }
    }

    fail(error: SubscriptionError) {
        this.call(() => this.listener?.onError?.(error));
    }
}

/** An entry's subscribers that take raw messages: raw subscribers, and state subscribers whose listener has `onMessage`. */
export const getMessageSubscribers = (entry: Entry): Subscriber[] => [...entry.subscribers].filter((s) => s.listener?.onMessage !== undefined);
