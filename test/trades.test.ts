import { describe, expect, it } from "vitest";
import { InstrumentStore } from "../src/instrument-store";
import { defined, definition, message, pairs, quiet, toLong } from "./helpers";

const mid = toLong(42);

/** ESZ26 with volume at price: 100 → 10, 100.25 → 4. */
const setup = () => {
    const store = new InstrumentStore(quiet);
    store.apply(message({ instrumentDefinition: definition() }));
    store.apply(
        message({
            marketSnapshot: {
                marketId: mid,
                tradeDate: 0,
                priceLevels: [],
                volumeAtPrice: {
                    priceVolumes: [
                        { price: toLong(10000), volume: toLong(10) },
                        { price: toLong(10025), volume: toLong(4) },
                    ],
                },
            },
        })
    );
    return store;
};

/** A trades update; `last` is the price of the session's last, if it carries one. */
const trades = (entries: object[], last?: number) =>
    message({
        marketUpdate: {
            marketId: mid,
            symbol: "ESZ26",
            session: last === undefined ? undefined : { last: { price: toLong(last), quantity: toLong(0) } },
            trades: { trades: entries },
        },
    });

const trade = (price: number, quantity: number, flags: object = {}) => ({ trade: { price: toLong(price), quantity: toLong(quantity), ...flags } });

describe("trades", () => {
    it("takes back a cancel's and a correction's original volume, and adds the correction's new trade", () => {
        const store = setup();
        const change = defined(
            store.apply(
                trades(
                    [
                        { tradeCancel: { correctedTradePrice: toLong(10025), correctedTradeQuantity: toLong(1) } },
                        {
                            tradeCorrection: {
                                originalTradePrice: toLong(10025),
                                originalTradeQuantity: toLong(1),
                                price: toLong(10050),
                                quantity: toLong(1),
                            },
                        },
                        // corrected to the price at last: counted in lastSize
                        {
                            tradeCorrection: {
                                originalTradePrice: toLong(10000),
                                originalTradeQuantity: toLong(2),
                                price: toLong(10075),
                                quantity: toLong(3),
                            },
                        },
                    ],
                    10075
                )
            )
        );
        const cv = defined(change.parts.cumulativeVolume);
        expect(pairs(cv.levels)).toEqual([
            [100, 8],
            [100.25, 2],
            [100.5, 1],
            [100.75, 3],
        ]);
        expect(pairs(cv.changed)).toEqual(pairs(cv.levels));
        expect(defined(change.parts.quote).quote.session.lastSize).toBe(3);
    });

    it("leaves out block trades, T-session trades, and trades that don't update volume or last", () => {
        const store = setup();
        const change = defined(
            store.apply(
                trades(
                    [
                        trade(10050, 1, { blockTrade: true }),
                        trade(10050, 2, { session: "T" }),
                        trade(10025, 4, { doesNotUpdateVolume: true }),
                        trade(10000, 5, { doesNotUpdateLast: true }),
                        trade(10050, 6),
                    ],
                    10050
                )
            )
        );
        const cv = defined(change.parts.cumulativeVolume);
        expect(pairs(cv.levels)).toEqual([
            [100, 10],
            [100.25, 4],
            [100.5, 6],
        ]);
        expect(pairs(cv.changed)).toEqual([[100.5, 6]]);
        expect(defined(change.parts.quote).quote.session.lastSize).toBe(6);
    });

    it("adds a level at last even when no trade was at last, with what traded there: nothing", () => {
        const store = setup();
        const change = defined(store.apply(trades([trade(10025, 1)], 10050)));
        expect(pairs(defined(change.parts.cumulativeVolume).changed)).toEqual([
            [100.25, 5],
            [100.5, 0],
        ]);
        expect(defined(change.parts.quote).quote.session.lastSize).toBe(0);
    });

    it("doesn't apply trades in an update without the session's last", () => {
        const store = setup();
        const levels = store.getCumulativeVolumeById("42");
        const change = defined(store.apply(trades([trade(10050, 1)])));
        expect(change.parts).toEqual({ quote: undefined, depth: undefined, cumulativeVolume: undefined });
        expect(store.getCumulativeVolumeById("42")).toBe(levels);
    });

    it("adds a last update's size at its price", () => {
        const store = setup();
        const change = defined(
            store.apply(message({ marketUpdate: { marketId: mid, symbol: "ESZ26", last: { price: toLong(10050), quantity: toLong(2) } } }))
        );
        expect(pairs(defined(change.parts.cumulativeVolume).changed)).toEqual([[100.5, 2]]);
        expect(defined(change.parts.quote).quote.session.lastSize).toBe(2);
    });
});
