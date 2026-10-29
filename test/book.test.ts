import { BookSide } from "@openfeed/sdk-js";
import { describe, expect, it } from "vitest";
import { InstrumentStore } from "../src/instrument-store";
import type { PriceLevel } from "../src/reducers/book";
import { defined, definition, level, message, recordingLogger, toLong } from "./helpers";

const mid = toLong(42);

/** ESZ26 with a book three levels deep: bids 100 × 5, 99.75 × 7; ask 100.25 × 3. */
const setup = () => {
    const { logger, warnings, errors } = recordingLogger();
    const store = new InstrumentStore(logger);
    store.apply(message({ instrumentDefinition: definition({ bookDepth: 3 }) }));
    store.apply(
        message({
            marketSnapshot: {
                marketId: mid,
                tradeDate: 0,
                priceLevels: [level(BookSide.BID, 1, 10000, 5), level(BookSide.BID, 2, 9975, 7), level(BookSide.OFFER, 1, 10025, 3)],
            },
        })
    );
    return { store, warnings, errors };
};

const depth = (store: InstrumentStore, ...levels: object[]) =>
    store.apply(message({ marketUpdate: { marketId: mid, symbol: "ESZ26", depthPriceLevel: { levels } } }));

const add = (side: BookSide, n: number, price: number, quantity: number) => ({ addPriceLevel: level(side, n, price, quantity) });
const modify = (side: BookSide, n: number, price: number, quantity: number) => ({ modifyPriceLevel: level(side, n, price, quantity) });
const remove = (side: BookSide, n: number) => ({ deletePriceLevel: { side, level: n } });

/** `[price, size]` pairs. */
const sizes = (levels: readonly PriceLevel[]) => levels.map((l) => [l.price, l.size]);

describe("depth updates", () => {
    it("builds both sides at the book's depth, with empty levels where the snapshot has none", () => {
        const book = defined(setup().store.getBookById("42"));
        expect(sizes(book.bids)).toEqual([
            [100, 5],
            [99.75, 7],
            [0, 0],
        ]);
        expect(sizes(book.asks)).toEqual([
            [100.25, 3],
            [0, 0],
            [0, 0],
        ]);
    });

    it("inserts an add, pushing the levels below it down and the last one off", () => {
        const { store } = setup();
        depth(store, add(BookSide.BID, 1, 10010, 1));
        expect(sizes(defined(store.getBookById("42")).bids)).toEqual([
            [100.1, 1],
            [100, 5],
            [99.75, 7],
        ]);
    });

    it("removes a delete, moving the levels below it up and adding an empty one at the end", () => {
        const { store } = setup();
        depth(store, remove(BookSide.BID, 1));
        expect(sizes(defined(store.getBookById("42")).bids)).toEqual([
            [99.75, 7],
            [0, 0],
            [0, 0],
        ]);
    });

    it("replaces a modify in place, with its order count", () => {
        const { store } = setup();
        depth(store, modify(BookSide.OFFER, 1, 10025, 9));
        const book = defined(store.getBookById("42"));
        expect(sizes(book.asks)).toEqual([
            [100.25, 9],
            [0, 0],
            [0, 0],
        ]);
        expect(book.asks[0].orderCount).toBeUndefined();
        depth(store, { modifyPriceLevel: { ...level(BookSide.OFFER, 1, 10025, 9), orderCount: 2 } });
        expect(defined(store.getBookById("42")).asks[0].orderCount).toBe(2);
    });

    it("applies a message's entries in order", () => {
        const { store } = setup();
        depth(store, remove(BookSide.BID, 1), add(BookSide.BID, 2, 9950, 2), modify(BookSide.OFFER, 1, 10050, 1));
        const book = defined(store.getBookById("42"));
        expect(sizes(book.bids)).toEqual([
            [99.75, 7],
            [99.5, 2],
            [0, 0],
        ]);
        expect(book.asks[0].price).toBe(100.5);
    });

    it("ignores depth without a book, with a warning, until a snapshot brings one", () => {
        const { logger, warnings } = recordingLogger();
        const store = new InstrumentStore(logger);
        store.apply(message({ instrumentDefinition: definition({ bookDepth: 3 }) }));
        store.apply(message({ marketSnapshot: { marketId: mid, tradeDate: 0, priceLevels: [] } }));
        const change = defined(depth(store, add(BookSide.BID, 1, 10000, 1)));
        expect(change.parts.depth).toBeUndefined();
        expect(store.getBookById("42")).toBeUndefined();
        expect(warnings).toHaveLength(1);
    });
});
