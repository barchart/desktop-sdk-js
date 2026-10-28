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

/** No book unless the snapshot has price levels. */
export const bookFromSnapshot = (levels: AddPriceLevel[], i: Instrument): Book | null => {
    if (!levels.length) {
        return null;
    }

    const bids = Array.from({ length: i.bookDepth }, emptyLevel);
    const asks = Array.from({ length: i.bookDepth }, emptyLevel);

    for (const level of levels) {
        if (level.side === BookSide.BID) {
            bids[level.level - 1] = toLevel(level, i);
        } else if (level.side === BookSide.OFFER) {
            asks[level.level - 1] = toLevel(level, i);
        }
    }

    return { bids, asks };
};

/** One entry applied to its side's levels; undefined, with a warning, when its index is out of range. */
const applyEntry = (elements: PriceLevel[], entry: DepthPriceLevel_Entry, index: number, i: Instrument, symbol: string, log: SdkLogger) => {
    if (entry.addPriceLevel) {
        // an add may go one level past the end, which lengthens that side
        if (index < 0 || index > elements.length + 1) {
            log.warn("OF > Strange element index received for add", symbol, index);
            return undefined;
        }
        return [...elements.slice(0, index), toLevel(entry.addPriceLevel, i), ...elements.slice(index, -1)];
    }
    if (entry.modifyPriceLevel) {
        if (index < 0 || index > elements.length) {
            log.warn("OF > Strange element index received for modify", symbol, index);
            return undefined;
        }
        return [...elements.slice(0, index), toLevel(entry.modifyPriceLevel, i), ...elements.slice(index + 1)];
    }
    if (index < 0 || index > elements.length) {
        log.warn("OF > Strange element index received for delete", symbol, index);
        return undefined;
    }
    return [...elements.slice(0, index), ...elements.slice(index + 1), emptyLevel()];
};

/** Add and delete keep each side's length; out-of-range levels are skipped with a warning. */
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
