import { InstrumentTradingStatus } from "@openfeed/sdk-js";
import Long from "long";
import { describe, expect, it } from "vitest";
import { InstrumentStore } from "../src/instrument-store";
import { defined, definition, message, quiet, toLong } from "./helpers";

const mid = toLong(42);

/** 2026-10-29T13:31:15.250Z, with nanoseconds below the millisecond. */
const nanos = Long.fromString("1793280675250999999");

/** A store with a definition whose quantities are in hundredths, and a snapshot's fields applied. */
const setup = (snapshot: object) => {
    const store = new InstrumentStore(quiet);
    store.apply(message({ instrumentDefinition: definition({ quantityDenominator: 100 }) }));
    store.apply(message({ marketSnapshot: { marketId: mid, tradeDate: 20261029, priceLevels: [], ...snapshot } }));
    return store;
};

const update = (store: InstrumentStore, fields: object) =>
    defined(store.apply(message({ marketUpdate: { marketId: mid, symbol: "ESZ26", ...fields } })));

const quote = (store: InstrumentStore) => defined(store.getQuoteById("42"));

describe("quantities", () => {
    const store = setup({
        bbo: {
            bidPrice: toLong(10000),
            bidQuantity: toLong(250),
            bidOrderCount: 3,
            offerPrice: toLong(10025),
            offerQuantity: toLong(350),
            offerOrderCount: 0,
        },
        last: { price: toLong(10000), quantity: toLong(250), transactionTime: nanos, tradeDate: 20261029 },
        volume: { volume: toLong(12345) },
        openInterest: { volume: toLong(999) },
    });

    it("keeps the best bid and offer's sizes, and a snapshot's last size, as sent", () => {
        const { bestBidOffer, session } = quote(store);
        expect([bestBidOffer.bidSize, bestBidOffer.askSize, bestBidOffer.bidOrderCount, bestBidOffer.askOrderCount]).toEqual([250, 350, 3, 0]);
        expect(session.lastSize).toBe(250);
    });

    it("scales volume and open interest, dropping the fraction", () => {
        const { session } = quote(store);
        expect([session.volume, session.openInterest]).toEqual([123, 9]);
    });

    it("scales a last update's size, dropping the fraction", () => {
        const s = setup({});
        update(s, { last: { price: toLong(10025), quantity: toLong(250) } });
        expect(quote(s).session.lastSize).toBe(2);
    });
});

describe("snapshots", () => {
    it("reads times to the millisecond, and trade dates as dates", () => {
        const { session } = quote(setup({ last: { price: toLong(10000), quantity: toLong(1), transactionTime: nanos, tradeDate: 20261029 } }));
        expect(session.lastTime?.toISOString()).toBe("2026-10-29T13:31:15.250Z");
        expect(session.lastTradeDate?.toString()).toBe("2026-10-29");
        expect(session.tradeDate?.toString()).toBe("2026-10-29");
    });

    it("dates the previous session's settlement with that session's date when it has none, and the current one's not at all", () => {
        const q = quote(
            setup({
                settlement: { price: toLong(10075), tradeDate: 0 },
                previousSession: { tradeDate: 20261028, settlement: { price: toLong(10050), tradeDate: 0, preliminarySettle: false } },
            })
        );
        expect([q.previousSession.settle, q.previousSession.settleTradeDate?.toString(), q.previousSession.settlePreliminary]).toEqual([
            100.5,
            "2026-10-28",
            false,
        ]);
        expect([q.session.settle, q.session.settleTradeDate]).toEqual([100.75, null]);
    });

    it("leaves every field of a session the snapshot doesn't carry null", () => {
        const { previousSession } = quote(setup({}));
        expect(Object.values(previousSession).every((v) => v === null)).toBe(true);
    });

    it("takes the status's date from the snapshot only when it has no status", () => {
        const own = quote(setup({})).status;
        expect([own.trading, own.prior, own.tradeDate?.toString(), own.time]).toEqual([null, null, "2026-10-29", null]);
        const { status } = quote(setup({ instrumentStatus: { tradingStatus: InstrumentTradingStatus.OPEN, priorTradingStatus: 0, tradeDate: 0 } }));
        expect([status.trading, status.tradeDate]).toEqual([InstrumentTradingStatus.OPEN, null]);
    });
});

describe("updates", () => {
    it("changes only the group an update is about, and only its fields", () => {
        const store = setup({ high: { price: toLong(10100) } });
        const before = quote(store);
        update(store, { low: { price: toLong(9900) } });
        const after = quote(store);
        expect([after.session.low, after.session.high]).toEqual([99, 101]);
        expect(after.previousSession).toBe(before.previousSession);
        expect(after.bestBidOffer).toBe(before.bestBidOffer);
    });

    it("applies a settlement to the current session, preliminary or not", () => {
        const store = setup({});
        update(store, { settlement: { price: toLong(10100), preliminarySettle: true, tradeDate: 20261029 } });
        const { session } = quote(store);
        expect([session.settle, session.settlePreliminary, session.settleTradeDate?.toString()]).toEqual([101, true, "2026-10-29"]);
    });

    it("applies a trades update's previous settlement to the previous session", () => {
        const store = setup({});
        update(store, { session: { prevSettlement: { price: toLong(10050), tradeDate: 20261028 } }, trades: { trades: [] } });
        const { previousSession, session } = quote(store);
        expect([previousSession.settle, previousSession.settleTradeDate?.toString()]).toEqual([100.5, "2026-10-28"]);
        expect(session.prevSettle).toBeNull();
    });

    it("replaces the status, with the time it changed", () => {
        const store = setup({});
        update(store, {
            instrumentStatus: {
                tradingStatus: InstrumentTradingStatus.CLOSE,
                priorTradingStatus: InstrumentTradingStatus.OPEN,
                tradeDate: 20261029,
                transactionTime: nanos,
            },
        });
        const { status } = quote(store);
        expect([status.trading, status.prior, status.tradeDate?.toString(), status.time?.toISOString()]).toEqual([
            InstrumentTradingStatus.CLOSE,
            InstrumentTradingStatus.OPEN,
            "2026-10-29",
            "2026-10-29T13:31:15.250Z",
        ]);
    });

    it("keeps the same quote for an update it doesn't model", () => {
        const store = setup({});
        const before = quote(store);
        const change = update(store, { yearHigh: { price: toLong(12000) } });
        expect(change.parts.quote).toBeUndefined();
        expect(quote(store)).toBe(before);
    });
});
