import { BookSide } from "@openfeed/sdk-js";
import { describe, expect, it } from "vitest";
import { InstrumentStore } from "../src/instrument-store";
import { defined, definition, level, message, pairs, quiet, toLong } from "./helpers";

const mid = toLong(42);

/** A store with ESZ26's definition and a snapshot with a book and volume at price, and the snapshot's change. */
const setup = () => {
    const store = new InstrumentStore(quiet);
    store.apply(message({ instrumentDefinition: definition() }));
    const snapshot = defined(
        store.apply(
            message({
                marketSnapshot: {
                    marketId: mid,
                    tradeDate: 0,
                    priceLevels: [level(BookSide.BID, 1, 10000, 5), level(BookSide.BID, 2, 9975, 7), level(BookSide.OFFER, 1, 10025, 3)],
                    volumeAtPrice: {
                        priceVolumes: [
                            { price: toLong(10025), volume: toLong(4) },
                            { price: toLong(10000), volume: toLong(10) },
                        ],
                    },
                },
            })
        )
    );
    return { store, snapshot };
};

describe("InstrumentStore", () => {
    it("builds a fixed-length, frozen book from a snapshot", () => {
        const { book } = defined(setup().snapshot.parts.depth);
        expect(book.bids).toHaveLength(5);
        expect(book.bids[2].size).toBe(0);
        expect(book.asks[0].price).toBe(100.25);
        expect(Object.isFrozen(book) && Object.isFrozen(book.bids) && Object.isFrozen(book.bids[0])).toBe(true);
    });

    it("seeds cumulative volume ascending, with every level changed", () => {
        const cv = defined(setup().snapshot.parts.cumulativeVolume);
        expect(pairs(cv.levels)).toEqual([
            [100, 10],
            [100.25, 4],
        ]);
        expect(cv.changed).toBe(cv.levels);
    });

    it("freezes the quote's sessions, and hands out the same objects from its getters", () => {
        const { store, snapshot } = setup();
        const { quote } = defined(snapshot.parts.quote);
        expect(Object.isFrozen(quote.session) && Object.isFrozen(quote.previousSession)).toBe(true);
        expect(store.getBookById("42")).toBe(defined(snapshot.parts.depth).book);
        expect(store.getCumulativeVolumeById("42")).toBe(defined(snapshot.parts.cumulativeVolume).levels);
    });

    it("applies a depth delete, shifting levels up and padding the end", () => {
        const { store } = setup();
        const change = defined(
            store.apply(
                message({
                    marketUpdate: {
                        marketId: mid,
                        symbol: "ESZ26",
                        depthPriceLevel: { levels: [{ deletePriceLevel: { side: BookSide.BID, level: 1 } }] },
                    },
                })
            )
        );
        const { bids } = defined(change.parts.depth).book;
        expect(bids).toHaveLength(5);
        expect(bids[0].price).toBe(99.75);
        expect(bids[1].size).toBe(0);
        expect(change.parts.cumulativeVolume).toBeUndefined();
        expect(change.parts.quote).toBeUndefined();
    });

    it("builds cumulative volume from trades, and the trades' size at last is lastSize", () => {
        const { store, snapshot } = setup();
        const change = defined(
            store.apply(
                message({
                    marketUpdate: {
                        marketId: mid,
                        symbol: "ESZ26",
                        session: { last: { price: toLong(10025) } },
                        trades: {
                            trades: [
                                { trade: { price: toLong(10050), quantity: toLong(1) } },
                                { trade: { price: toLong(10025), quantity: toLong(2) } },
                            ],
                        },
                    },
                })
            )
        );
        const cv = defined(change.parts.cumulativeVolume);
        expect(pairs(cv.levels)).toEqual([
            [100, 10],
            [100.25, 6],
            [100.5, 1],
        ]);
        expect(pairs(cv.changed)).toEqual([
            [100.25, 6],
            [100.5, 1],
        ]);
        const { quote } = defined(change.parts.quote);
        expect([quote.session.last, quote.session.lastSize]).toEqual([100.25, 2]);
        expect(quote.previousSession).toBe(defined(snapshot.parts.quote).quote.previousSession);
    });

    it("keeps book and cumulative volume through a snapshot without them", () => {
        const { store } = setup();
        const levels = store.getCumulativeVolumeById("42");
        const change = defined(store.apply(message({ marketSnapshot: { marketId: mid, tradeDate: 0, priceLevels: [] } })));
        expect(change.parts.cumulativeVolume).toBeUndefined();
        expect(change.parts.depth).toBeUndefined();
        expect(store.getCumulativeVolumeById("42")).toBe(levels);
    });
});
