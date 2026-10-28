import type { Trades, VolumeAtPrice } from "@openfeed/sdk-js";
import type Long from "long";
import type { Instrument } from "../instrument";

/** One change to the volume at a price, in the order it happens; the store applies them in that order. */
export interface CumulativeVolumeStep {
    readonly price: number;
    readonly delta: number;
}

/** Seed from the snapshot's volume at price, in ascending price order. */
export const seedSteps = (vap: VolumeAtPrice, i: Instrument): CumulativeVolumeStep[] =>
    vap.priceVolumes.map((pv) => ({ price: i.price(pv.price), delta: i.quantity(pv.volume) })).sort((a, b) => a.price - b.price);

/**
 * Steps for the trades of an update that carries `session.last`, at its price `lastPrice`; trades in updates without
 * it are not applied. Trades and corrections at `last` are summed into one final step at `last`, and that sum is also
 * the quote's `lastSize`.
 */
export const tradeSteps = (trades: Trades, lastPrice: Long, i: Instrument): { lastSize: number; steps: CumulativeVolumeStep[] } => {
    const last = i.price(lastPrice);
    const steps: CumulativeVolumeStep[] = [];
    let currentPriceSize = 0;

    for (const t of trades.trades) {
        if (t.trade) {
            const counts = !t.trade.doesNotUpdateVolume && !t.trade.doesNotUpdateLast && t.trade.session !== "T" && !t.trade.blockTrade;
            const tradePrice = i.price(t.trade.price);
            if (counts && tradePrice === last) {
                currentPriceSize += i.quantity(t.trade.quantity);
            } else if (counts) {
                steps.push({ price: tradePrice, delta: i.quantity(t.trade.quantity) });
            }
        } else if (t.tradeCancel) {
            steps.push({ price: i.price(t.tradeCancel.correctedTradePrice), delta: -i.quantity(t.tradeCancel.correctedTradeQuantity) });
        } else if (t.tradeCorrection) {
            steps.push({ price: i.price(t.tradeCorrection.originalTradePrice), delta: -i.quantity(t.tradeCorrection.originalTradeQuantity) });

            const newPrice = i.price(t.tradeCorrection.price);
            if (newPrice === last) {
                currentPriceSize += i.quantity(t.tradeCorrection.quantity);
            } else {
                steps.push({ price: newPrice, delta: i.quantity(t.tradeCorrection.quantity) });
            }
        }
    }

    steps.push({ price: last, delta: currentPriceSize });
    return { lastSize: currentPriceSize, steps };
};

/** A `last` update adds its size at its price. */
export const lastSteps = (last: number | null, lastSize: number | null): CumulativeVolumeStep[] =>
    last !== null && lastSize !== null ? [{ price: last, delta: lastSize }] : [];
