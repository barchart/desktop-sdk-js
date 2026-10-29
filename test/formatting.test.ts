import { describe, expect, it } from "vitest";
import type { MarketSnapshot } from "@openfeed/sdk-js";
import { formatQuote } from "../src/formatted-quote";
import { createInstrument, type PriceNotation } from "../src/instrument";
import { applySnapshot } from "../src/reducers/quote";
import { decimalFormat, definition, fractionFormat, quiet, recordingLogger } from "./helpers";

const es = createInstrument(definition({ marketId: 1, symbol: "ESZ26", priceFormat: decimalFormat(100) }), quiet);
const zn = createInstrument(definition({ marketId: 2, symbol: "ZNZ26", priceFormat: fractionFormat(32), priceDenominator: 1000000 }), quiet);
const zt = createInstrument(definition({ marketId: 3, symbol: "ZTZ26", priceFormat: fractionFormat(32, 4), priceDenominator: 1000000 }), quiet);

describe("instrument.formatPrice", () => {
    it("formats decimals with thousands separators", () => {
        expect(es.formatPrice(6812.25)).toBe("6,812.25");
        expect(es.formatPrice(6812.25, "decimal")).toBe("6,812.25");
    });

    it("formats fractions natively, and in decimal with the decimals the fraction needs", () => {
        expect(zn.formatPrice(112.5)).toBe("112-16");
        expect(zn.formatPrice(112.5, "decimal")).toBe("112.50000");
        expect(zn.formatPrice(-0.03125, "decimal")).toBe("-0.03125");
        expect(zt.formatPrice(104.0078125, "decimal")).toBe("104.0078125");
    });

    it("formats no price as an empty string, and any other notation as native", () => {
        expect(zn.formatPrice(null, "decimal")).toBe("");
        expect(zn.formatPrice(112.5, 0 as unknown as PriceNotation)).toBe("112-16");
    });
});

describe("fractions", () => {
    it("formats a negative price with its sign before the whole part", () => {
        expect(zn.formatPrice(-112.5)).toBe("-112-16");
        expect(zn.formatPrice(-0.03125)).toBe("-0-01");
    });

    it("formats quarters of a 32nd as their first decimal digit, in three digits", () => {
        expect(zt.formatPrice(104.0078125)).toBe("104-002");
        expect(zt.formatPrice(104.015625)).toBe("104-005");
        expect(zt.formatPrice(104.0234375)).toBe("104-007");
    });

    it("parses what it formats, signs included", () => {
        expect(zn.parsePrice("112-16")).toBe(112.5);
        expect(zn.parsePrice("-112-16")).toBe(-112.5);
        expect(zn.parsePrice("-0-01")).toBe(-0.03125);
        expect(zt.parsePrice("104-005")).toBe(104.015625);
    });

    it("parses text without a fraction as a decimal, and nothing as undefined", () => {
        expect(zn.parsePrice("112.5")).toBe(112.5);
        expect(zn.parsePrice("")).toBeUndefined();
    });
});

describe("decimals", () => {
    it("formats with thousands separators and the format's decimals, and parses them back", () => {
        expect(es.formatPrice(1234567.5)).toBe("1,234,567.50");
        expect(es.formatPrice(-1234.5)).toBe("-1,234.50");
        expect(es.parsePrice("1,234,567.50")).toBe(1234567.5);
    });
});

describe("a definition without a price format", () => {
    const { logger, warnings } = recordingLogger();
    const plain = createInstrument(definition({ priceFormat: null, priceDenominator: 1 }), logger);

    it("warns, and scales prices by the denominator alone", () => {
        expect(warnings).toHaveLength(1);
        expect(plain.priceFormat).toEqual({ priceScaling: 1 });
    });

    it("formats prices as JavaScript prints numbers, in either notation", () => {
        expect(plain.formatPrice(100)).toBe("100");
        expect(plain.formatPrice(100.5)).toBe("100.5");
        expect(plain.formatPrice(1234567)).toBe("1234567");
        expect(plain.formatPrice(100, "decimal")).toBe("100");
    });
});

describe("formatQuote", () => {
    const empty = applySnapshot({ tradeDate: 0 } as unknown as MarketSnapshot, zn);
    const quote = {
        ...empty,
        bestBidOffer: { ...empty.bestBidOffer, bidPrice: 112.484375, askPrice: 112.5, bidSize: 1500 },
        session: { ...empty.session, last: 112.5, volume: 1204551 },
        previousSession: { ...empty.previousSession, settle: 112.03125, prevSettle: 111.875 },
    };
    const f = formatQuote(quote, zn);

    it("has a view per group, and nothing else", () => {
        const members = Object.keys(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(f) as object));
        expect(members.filter((k) => k !== "constructor").sort()).toEqual(["bestBidOffer", "previousSession", "session", "toJSON"]);
    });

    it("formats prices natively and in decimal, and quantities with separators", () => {
        expect(f.bestBidOffer.bidPrice).toBe("112-15");
        expect(f.bestBidOffer.decimal.bidPrice).toBe("112.48438");
        expect(f.bestBidOffer.bidSize).toBe("1,500");
        expect(f.session.last).toBe("112-16");
        expect(f.session.decimal.last).toBe("112.50000");
        expect(f.session.volume).toBe("1,204,551");
        expect(f.session.decimal.volume).toBe("1,204,551");
        expect(f.previousSession.settle).toBe("112-01");
        expect(f.previousSession.prevSettle).toBe("111-28");
        expect(f.session.settle).toBe("");
    });

    it("builds each view once", () => {
        expect(f.session).toBe(f.session);
        expect(f.bestBidOffer).toBe(f.bestBidOffer);
        expect(f.session.decimal).toBe(f.session.decimal);
    });

    it("gives every field as a frozen plain object, for spreading", () => {
        expect(Object.keys(f.session.values)).toHaveLength(12);
        expect(Object.keys(f.bestBidOffer.values).sort()).toEqual(["askOrderCount", "askPrice", "askSize", "bidOrderCount", "bidPrice", "bidSize"]);
        expect({ ...f.session.values }.last).toBe("112-16");
        expect(Object.isFrozen(f.session.values)).toBe(true);
        expect(f.session.values).toBe(f.session.values);
        expect(["values", "decimal", "session"].some((k) => k in f.bestBidOffer.values || k in f.session.values)).toBe(false);
    });

    it("serializes every group with its decimal view, and no status", () => {
        const json = JSON.parse(JSON.stringify(f)) as {
            session: { last: string; decimal: Record<string, string> };
            previousSession: { settle: string };
            bestBidOffer: { bidPrice: string; decimal: { askPrice: string } };
        };
        expect(json.session.last).toBe("112-16");
        expect(json.session.decimal.last).toBe("112.50000");
        expect(json.previousSession.settle).toBe("112-01");
        expect(json.bestBidOffer.bidPrice).toBe("112-15");
        expect(json.bestBidOffer.decimal.askPrice).toBe("112.50000");
        expect("decimal" in json.session.decimal).toBe(false);
        expect("status" in json).toBe(false);
    });
});
