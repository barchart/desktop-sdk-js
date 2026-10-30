import { type AddPriceLevel, BookSide, type DepthPriceLevel, type DepthPriceLevel_Entry } from "@openfeed/sdk-js";
import type Long from "long";
import type { Instrument } from "../instrument";
import type { SdkLogger } from "../types";

export interface PriceLevel {
    readonly price: number;
    readonly size: number;
    readonly orderCount?: number;
}

/** Fixed length: both sides always have `bookDepth` slots; empty slots are { price: 0, size: 0 }. */
export interface Book {
    readonly bids: PriceLevel[];
    readonly asks: PriceLevel[];
}

const emptyLevel = (): PriceLevel => ({ size: 0, price: 0, orderCount: undefined });

const toLevel = (level: { price: Long; quantity: Long; orderCount: number }, i: Instrument): PriceLevel => ({
    size: i.quantity(level.quantity),
    price: i.price(level.price),
    orderCount: level.orderCount === 0 ? undefined : level.orderCount,
});

/** No book unless the snapshot has price levels. Levels outside the book's depth are skipped, with an error. */
export const bookFromSnapshot = (levels: AddPriceLevel[], i: Instrument, log: SdkLogger): Book | null => {
    if (!levels.length) {
        return null;
    }

    const bids = Array.from({ length: i.bookDepth }, emptyLevel);
    const asks = Array.from({ length: i.bookDepth }, emptyLevel);

    const sides = new Map([
        [BookSide.BID, bids],
        [BookSide.OFFER, asks],
    ]);
    for (const level of levels) {
        const side = sides.get(level.side);
        if (side && (level.level < 1 || level.level > side.length)) {
            log.error("OF SDK > Snapshot book level out of range, skipped", i.symbol, level.level);
        } else if (side) {
            side[level.level - 1] = toLevel(level, i);
        }
    }

    return { bids, asks };
};

/**
 * One entry applied to its side's levels; undefined, with an error, when its level is outside the side: every
 * operation keeps the side `bookDepth` long.
 */
const applyEntry = (elements: PriceLevel[], entry: DepthPriceLevel_Entry, index: number, i: Instrument, symbol: string, log: SdkLogger) => {
    if (index < 0 || index >= elements.length) {
        log.error("OF SDK > Book level out of range, skipped", symbol, index + 1);
        return undefined;
    }
    if (entry.addPriceLevel) {
        return [...elements.slice(0, index), toLevel(entry.addPriceLevel, i), ...elements.slice(index, -1)];
    }
    if (entry.modifyPriceLevel) {
        return [...elements.slice(0, index), toLevel(entry.modifyPriceLevel, i), ...elements.slice(index + 1)];
    }
    return [...elements.slice(0, index), ...elements.slice(index + 1), emptyLevel()];
};

/** Every entry keeps each side's length; levels outside the book are skipped with an error. */
export const applyDepth = (book: Book, depth: DepthPriceLevel, i: Instrument, symbol: string, log: SdkLogger): Book => {
    let { bids, asks } = book;

    for (const entry of depth.levels) {
        const { side, level } = entry.addPriceLevel ?? entry.deletePriceLevel ?? entry.modifyPriceLevel ?? {};
        if (side === BookSide.BID && level) {
            bids = applyEntry(bids, entry, level - 1, i, symbol, log) ?? bids;
        } else if (side && level) {
            asks = applyEntry(asks, entry, level - 1, i, symbol, log) ?? asks;
        }
    }

    return { bids, asks };
};
