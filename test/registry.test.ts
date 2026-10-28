import { Result, Service as S, SubscriptionType as T, type IOpenFeedClient, type SubscriptionResponse } from "@openfeed/sdk-js";
import Long from "long";
import { describe, expect, it } from "vitest";
import type { SubscriptionError } from "../src";
import { Registry } from "../src/registry";
import { getSubscriberError, getSubscriberState, Subscriber, type Method } from "../src/subscriber";
import { ignore, quiet } from "./helpers";

const key = (service: S, type: T, symbol = "ESZ26") => `+${String(service)}|${String(type)}|${symbol}`;

/** A registry on a fake client that records what goes on the wire. */
const setup = () => {
    const wire: string[] = [];
    const registry = new Registry(quiet);
    const client = {
        subscribe: (service: S, type: T, _id: number, [symbol]: string[]) => {
            wire.push(key(service, type, symbol));
            return Long.fromNumber(wire.length);
        },
        unsubscribe: (id: Long) => void wire.push(`-${id.toString()}`),
    };
    registry.attach(client as unknown as IOpenFeedClient);
    return { registry, wire };
};

const subscribe = (registry: Registry, service: S, type: T, method: Method) => {
    const errors: T[] = [];
    const subscriber = new Subscriber(
        { service, type, symbol: "ESZ26" },
        method,
        { onError: (e: SubscriptionError) => void errors.push(e.type) },
        quiet,
        ignore
    );
    subscriber.entry = registry.acquire(service, type, "ESZ26", []);
    subscriber.entry.subscribers.add(subscriber);
    return { subscriber, errors, entry: subscriber.entry };
};

const response = (type: T, ok: boolean) =>
    ({
        symbol: "ESZ26",
        subscriptionType: type,
        unsubscribe: false,
        marketId: Long.fromNumber(ok ? 5 : 0),
        status: { result: ok ? Result.SUCCESS : Result.INVALID_SYMBOL, message: ok ? "" : "nope" },
    }) as unknown as SubscriptionResponse;

describe("cumulative volume's ALL dependency", () => {
    it("subscribes ALL with a cumulative volume alone, and a later quote shares it", () => {
        const { registry, wire } = setup();
        registry.acquire(S.REAL_TIME_SNAPSHOT, T.CUMULATIVE_VOLUME, "ESZ26", []);
        expect(wire).toEqual([key(S.REAL_TIME, T.ALL), key(S.REAL_TIME_SNAPSHOT, T.CUMULATIVE_VOLUME)]);
        registry.acquire(S.REAL_TIME, T.ALL, "ESZ26", []);
        expect(wire).toHaveLength(2);
    });

    it("shares the quote's ALL when the quote comes first", () => {
        const { registry, wire } = setup();
        registry.acquire(S.REAL_TIME, T.ALL, "ESZ26", []);
        registry.acquire(S.REAL_TIME_SNAPSHOT, T.CUMULATIVE_VOLUME, "ESZ26", []);
        expect(wire).toEqual([key(S.REAL_TIME, T.ALL), key(S.REAL_TIME_SNAPSHOT, T.CUMULATIVE_VOLUME)]);
    });

    it("keeps ALL while the cumulative volume holds it, and removes both with it", () => {
        const { registry, wire } = setup();
        const quote = registry.acquire(S.REAL_TIME, T.ALL, "ESZ26", []);
        const cv = registry.acquire(S.REAL_TIME_SNAPSHOT, T.CUMULATIVE_VOLUME, "ESZ26", []);
        registry.remove(quote);
        expect(wire.filter((w) => w.startsWith("-"))).toEqual([]);
        registry.remove(cv);
        expect(wire.filter((w) => w.startsWith("-"))).toHaveLength(2);
    });
});

describe("a failed dependency", () => {
    it("reaches the quote and the cumulative volume subscribers, with ALL's error", () => {
        const { registry } = setup();
        const quote = subscribe(registry, S.REAL_TIME, T.ALL, "quote");
        const cv = subscribe(registry, S.REAL_TIME_SNAPSHOT, T.CUMULATIVE_VOLUME, "cumulativeVolume");
        registry.onResponse(response(T.CUMULATIVE_VOLUME, true));
        registry.onResponse(response(T.ALL, false));

        expect(quote.errors).toEqual([T.ALL]);
        expect(cv.errors).toEqual([T.ALL]);
        expect(cv.subscriber.handle.state).toBe("error");
        expect(cv.subscriber.handle.error?.type).toBe(T.ALL);
        // diagnostics show the entry as the server answered it
        expect(cv.entry.status).toBe("active");

        registry.onResponse(response(T.ALL, true));
        expect(cv.subscriber.handle.state).toBe("active");
    });

    it("isn't reported twice to a cumulative volume that failed on its own", () => {
        const { registry } = setup();
        const cv = subscribe(registry, S.REAL_TIME_SNAPSHOT, T.CUMULATIVE_VOLUME, "cumulativeVolume");
        registry.onResponse(response(T.CUMULATIVE_VOLUME, false));
        registry.onResponse(response(T.ALL, false));
        expect(cv.errors).toEqual([T.CUMULATIVE_VOLUME]);
    });

    it("keeps the cumulative volume in error until logout clears it", () => {
        const { registry } = setup();
        const cv = subscribe(registry, S.REAL_TIME_SNAPSHOT, T.CUMULATIVE_VOLUME, "cumulativeVolume");
        registry.onResponse(response(T.ALL, false));
        registry.onResponse(response(T.CUMULATIVE_VOLUME, true));
        expect(getSubscriberState(cv.entry)).toBe("error");

        registry.detach();
        expect(getSubscriberState(cv.entry)).toBe("pending");
        expect(getSubscriberError(cv.entry)).toBeUndefined();
    });
});
