import { BookSide, Result, Service, SubscriptionType as T, type OpenFeedListeners } from "@openfeed/sdk-js";
import Long from "long";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopSdk, type BookEvent, type CumulativeVolumeEvent, type DesktopSdkOptions, type QuoteEvent } from "../src";
import { defined, definition, ignore, level, message, pairs, quiet, sleep, toLong } from "./helpers";

// The Openfeed client, replaced by one that keeps its listeners, so tests can feed messages to the SDK, and records
// the calls it gets.
const clients = vi.hoisted(() => ({ last: undefined as { listeners: OpenFeedListeners } | undefined }));
vi.mock("@openfeed/sdk-js", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@openfeed/sdk-js")>()),
    OpenFeedClient: class {
        subscriptions = 0;
        readonly unsubscribed: Long[] = [];
        disposed = false;

        constructor(
            _url: string,
            _username: string,
            _password: string,
            readonly listeners: OpenFeedListeners
        ) {
            clients.last = this;
        }

        subscribe() {
            this.subscriptions += 1;
            return Long.fromNumber(this.subscriptions);
        }

        unsubscribe(id: Long) {
            this.unsubscribed.push(id);
        }

        dispose() {
            this.disposed = true;
        }
    },
}));

const mid = toLong(42);
/** Hands a message to the SDK as the client would; the SDK's listener is synchronous. */
const send = (fields: object): void => {
    void defined(clients.last).listeners.onMessageWithMetadata(message(fields), ["ESZ26"], undefined);
};

const respond = (type: T) => {
    send({
        subscriptionResponse: {
            symbol: "ESZ26",
            subscriptionType: type,
            unsubscribe: false,
            marketId: mid,
            status: { result: Result.SUCCESS },
        },
    });
};
const snapshot = () => {
    send({
        marketSnapshot: {
            marketId: mid,
            tradeDate: 0,
            transactionTime: toLong(0),
            priceLevels: [level(BookSide.BID, 1, 10000, 5)],
            volumeAtPrice: { priceVolumes: [{ price: toLong(10000), volume: toLong(10) }] },
        },
    });
};
const update = (fields: object) => {
    send({ marketUpdate: { marketId: mid, symbol: "ESZ26", transactionTime: toLong(0), ...fields } });
};
const bbo = (bid: number) => {
    update({
        bbo: {
            bidPrice: toLong(bid),
            bidQuantity: toLong(1),
            offerPrice: toLong(bid + 25),
            offerQuantity: toLong(1),
            bidOrderCount: 0,
            offerOrderCount: 0,
        },
    });
};
const trade = (price: number, quantity: number) => {
    update({
        session: { last: { price: toLong(price), quantity: toLong(quantity), transactionTime: toLong(0) } },
        trades: { trades: [{ trade: { price: toLong(price), quantity: toLong(quantity) } }] },
    });
};
const depth = () => {
    update({ depthPriceLevel: { levels: [{ modifyPriceLevel: level(BookSide.BID, 1, 10000, 9) }] } });
};

/** Every SDK a test creates, disposed after it. */
const created: DesktopSdk[] = [];
afterEach(() => {
    for (const sdk of created.splice(0)) {
        sdk.dispose();
    }
});

const createSdk = (options: DesktopSdkOptions = {}) => {
    const sdk = new DesktopSdk({ logger: quiet, ...options });
    created.push(sdk);
    return sdk;
};

/** A logged-in SDK with a quote, depth and cumulative volume subscription on ESZ26, and its definition. */
const setup = async (options: DesktopSdkOptions = {}) => {
    const sdk = createSdk(options);
    const got = { quote: [] as QuoteEvent[], book: [] as BookEvent[], cv: [] as CumulativeVolumeEvent[], raw: 0 };
    sdk.login({ url: "ws://test", username: "u", password: "p" });
    sdk.subscribeQuote("ESZ26", {
        onEvent: (e) => {
            got.quote.push(e);
        },
        onMessage: () => {
            got.raw += 1;
        },
    });
    sdk.subscribeDepth("ESZ26", {
        onEvent: (e) => {
            got.book.push(e);
        },
    });
    sdk.subscribeCumulativeVolume("ESZ26", {
        onEvent: (e) => {
            got.cv.push(e);
        },
    });
    await sleep(0);
    respond(T.ALL);
    respond(T.DEPTH_PRICE);
    respond(T.CUMULATIVE_VOLUME);
    send({ instrumentDefinition: definition({ bookDepth: 2 }) });
    return { sdk, got };
};

describe("raw access and lifetime", () => {
    it("groups raw access and diagnostics as frozen objects", () => {
        const sdk = createSdk();
        expect(Object.isFrozen(sdk.raw) && Object.isFrozen(sdk.diagnostics)).toBe(true);
        expect(Object.keys(sdk.raw).sort()).toEqual(["lookupInstruments", "onMessage", "requestSnapshot", "send", "subscribe"]);
        expect(Object.keys(sdk.diagnostics).sort()).toEqual(["getConnectionToken", "getLastMessages", "getSubscriptionInfo"]);
    });

    it("subscribes raw on REAL_TIME, and snapshots on REAL_TIME_SNAPSHOT, by default", async () => {
        const sdk = createSdk();
        sdk.raw.subscribe("ZC^UDS", T.ALL, { onMessage: ignore });
        void sdk.raw.requestSnapshot("ZCZ26").catch(ignore);
        await sleep(0);
        const info = sdk.diagnostics.getSubscriptionInfo().map((e) => `${String(e.service)}|${String(e.type)}|${e.symbol}|${e.state}`);
        expect(info.sort()).toEqual(
            [
                `${String(Service.REAL_TIME)}|${String(T.ALL)}|ZC^UDS|pending`,
                `${String(Service.REAL_TIME_SNAPSHOT)}|${String(T.ALL)}|ZCZ26|pending`,
            ].sort()
        );
        expect(sdk.diagnostics.getConnectionToken()).toBeUndefined();
        expect(sdk.raw.send({})).toBeUndefined();
        expect(sdk.diagnostics.getLastMessages("ZCZ26")).toBeUndefined();
    });

    it("rejects snapshot requests pending at dispose, and any after it", async () => {
        const sdk = createSdk();
        const pending = sdk.raw.requestSnapshot("ZCZ26");
        await sleep(0);
        sdk.dispose();
        await expect(pending).rejects.toThrow("The Desktop SDK was disposed");
        await expect(sdk.raw.requestSnapshot("ZCZ26")).rejects.toThrow("The Desktop SDK was disposed");
    });
});

describe("an instrument's symbol", () => {
    it("is the name it's reached by, with one copy per name until the next definition", async () => {
        const sdk = createSdk();
        const got: QuoteEvent[] = [];
        sdk.login({ url: "ws://test", username: "u", password: "p" });
        for (const symbol of ["ESZ26", "ES*1"]) {
            sdk.subscribeQuote(symbol, {
                onEvent: (e) => {
                    got.push(e);
                },
            });
        }
        await sleep(0);
        for (const symbol of ["ESZ26", "ES*1"]) {
            send({
                subscriptionResponse: { symbol, subscriptionType: T.ALL, unsubscribe: false, marketId: mid, status: { result: Result.SUCCESS } },
            });
        }
        send({ instrumentDefinition: definition({ symbol: "ESZ6" }) });
        snapshot();
        bbo(10000);

        expect(got.map((e) => [e.symbol, e.instrument.symbol])).toEqual([
            ["ESZ26", "ESZ26"],
            ["ES*1", "ES*1"],
            ["ESZ26", "ESZ26"],
            ["ES*1", "ES*1"],
        ]);
        const alias = defined(sdk.getInstrument("ES*1"));
        expect([got[1].instrument, got[3].instrument]).toEqual([alias, alias]);
        expect(got[1].instrument).toBe(got[3].instrument);
        expect(defined(sdk.getInstrument("ESZ26")).symbol).toBe("ESZ26");
        expect(alias.definition.symbol).toBe("ESZ6");
        // asked for by the definition's own symbol, it's named by that
        expect(defined(sdk.getInstrument("ESZ6")).symbol).toBe("ESZ6");

        send({ instrumentDefinition: definition({ symbol: "ESZ6", bookDepth: 3 }) });
        const redefined = defined(sdk.getInstrument("ES*1"));
        expect(redefined).not.toBe(alias);
        expect([redefined.symbol, redefined.bookDepth]).toEqual(["ES*1", 3]);
    });
});

describe("markets a subscription names", () => {
    const uds = (marketId: number, symbol: string) => {
        send({
            subscriptionResponse: {
                symbol: "ZC^UDS",
                subscriptionType: T.ALL,
                unsubscribe: false,
                marketId: toLong(marketId),
                status: { result: Result.SUCCESS },
            },
        });
        send({ instrumentDefinition: definition({ marketId, symbol }) });
        send({ marketSnapshot: { marketId: toLong(marketId), tradeDate: 0, transactionTime: toLong(0), priceLevels: [] } });
    };

    it("keep no state for a market none names, and hand its messages to the raw listeners only", async () => {
        const sdk = createSdk();
        let raw = 0;
        sdk.raw.onMessage(() => {
            raw += 1;
        });
        sdk.login({ url: "ws://test", username: "u", password: "p" });
        await sleep(0);
        send({ instrumentDefinition: definition({ marketId: 7, symbol: "ZCZ6" }) });
        send({ marketSnapshot: { marketId: toLong(7), tradeDate: 0, transactionTime: toLong(0), priceLevels: [] } });
        await sleep(0);
        expect(raw).toBe(2);
        expect([sdk.getInstrument("ZCZ6"), sdk.getQuote("ZCZ6")]).toEqual([undefined, undefined]);
    });

    it("find a root subscription's instruments by their definition's symbol, while it's open", async () => {
        const sdk = createSdk();
        const removed: string[] = [];
        sdk.onRemoved((symbol) => removed.push(symbol));
        sdk.login({ url: "ws://test", username: "u", password: "p" });
        const root = sdk.raw.subscribe("ZC^UDS", T.ALL, { onMessage: ignore });
        await sleep(0);
        uds(7, "ZCZ6");
        expect(defined(sdk.getInstrument("ZCZ6")).symbol).toBe("ZCZ6");
        expect(sdk.getQuote("ZCZ6")).toBeDefined();
        expect(sdk.isSubscribed("ZCZ6")).toBe(true);

        root.close();
        await sleep(0);
        expect(removed.sort()).toEqual(["ZCZ6", "ZC^UDS"]);
        expect([sdk.isSubscribed("ZCZ6"), sdk.getQuote("ZCZ6")]).toEqual([false, undefined]);

        // one still on its way after the close doesn't bring the market back
        send({ instrumentDefinition: definition({ marketId: 7, symbol: "ZCZ6" }) });
        expect(sdk.getInstrument("ZCZ6")).toBeUndefined();
    });
});

describe("delivery", () => {
    it("delivers an event per message by default", async () => {
        const { got } = await setup();
        snapshot();
        bbo(10000);
        bbo(10025);
        trade(10050, 2);
        expect([got.quote.length, got.book.length, got.cv.length]).toEqual([4, 1, 2]);
    });
});

describe("coalesceIntervalMs", () => {
    it("holds events for the interval, then delivers one per subscription with the latest state", async () => {
        const { sdk, got } = await setup({ coalesceIntervalMs: 30 });
        const rawBefore = got.raw;
        snapshot();
        bbo(10000);
        bbo(10025);
        trade(10050, 2);
        depth();
        trade(10075, 3);

        expect([got.quote.length, got.book.length, got.cv.length]).toEqual([0, 0, 0]);
        // raw messages aren't held
        expect(got.raw - rawBefore).toBe(6);
        // the state is current at once
        expect(defined(sdk.getQuote("ESZ26")).bestBidOffer.bidPrice).toBe(100.25);

        await sleep(45);
        expect([got.quote.length, got.book.length, got.cv.length]).toEqual([1, 1, 1]);
        const [quote, book, cv] = [got.quote[0], got.book[0], got.cv[0]];
        expect([quote.quote.bestBidOffer.bidPrice, quote.quote.session.last]).toEqual([100.25, 100.75]);
        expect([quote.kind, cv.kind]).toEqual(["snapshot", "snapshot"]);
        expect(book.book.bids[0].size).toBe(9);
        expect(pairs(cv.levels)).toEqual([
            [100, 10],
            [100.5, 2],
            [100.75, 3],
        ]);
        // after a snapshot, every level
        expect(pairs(cv.changed)).toEqual(pairs(cv.levels));
    });

    it("merges cumulative volume's changed levels across an interval of updates", async () => {
        const { got } = await setup({ coalesceIntervalMs: 30 });
        snapshot();
        await sleep(45);
        trade(10050, 1);
        bbo(10050);
        trade(10100, 4);
        await sleep(45);

        expect([got.quote.length, got.cv.length]).toEqual([2, 2]);
        expect(got.quote[1].kind).toBe("update");
        expect(pairs(got.cv[1].changed)).toEqual([
            [100.5, 1],
            [101, 4],
        ]);
        // the last message behind it
        expect(got.quote[1].raw.marketUpdate?.trades).toBeDefined();
    });

    it("drops what's held at logout", async () => {
        const { sdk, got } = await setup({ coalesceIntervalMs: 30 });
        snapshot();
        sdk.logout();
        await sleep(45);
        expect(got.quote).toHaveLength(0);
    });
});
