import { type InstrumentDefinition, InstrumentDefinition_InstrumentType, InstrumentDefinition_OptionType } from "@openfeed/sdk-js";
import type Long from "long";
import { formatPrice, formatPriceDecimal, getIntegerPart, priceToNumber, type PriceFormat } from "./price-format";
import type { SdkLogger } from "./types";

/** `native`: the instrument's own notation (fractional for 32nds, say: "112-16"); `decimal`: "112.50000". */
export type PriceNotation = "native" | "decimal";

/**
 * An instrument, from its Openfeed definition: what it is, where it trades, and how its prices are read and written.
 * Every event carries one, and `sdk.getInstrument` returns it.
 */
export interface Instrument {
    /** Openfeed's id for the market, as a string. */
    readonly marketId: string;
    /**
     * The symbol it was subscribed with, as the event's `symbol`, or the one passed to `sdk.getInstrument`: for
     * `ES*1`, it's `ES*1`. The definition's own symbol, which can be the exchange's (`ESZ6`), is `definition.symbol`.
     */
    readonly symbol: string;
    /** A human-readable description of the market. */
    readonly description: string;
    /** What kind of instrument it is, such as a future, an option or an equity. */
    readonly instrumentType: InstrumentDefinition_InstrumentType;
    /** The exchange's ISO 10383 market identifier code (MIC). */
    readonly exchangeCode: string;
    /** The exchange's time zone, as a tz database name such as `America/Chicago`. */
    readonly timeZoneName: string;
    /** How many price levels each side of the order book has. */
    readonly bookDepth: number;
    /** The smallest price change, in the market's currency. */
    readonly minimumPriceIncrement: number;
    /** How the instrument's prices are written, which `formatPrice` and `parsePrice` use. */
    readonly priceFormat: PriceFormat;
    /** The Openfeed definition everything else here comes from, with the fields the SDK doesn't model. */
    readonly definition: InstrumentDefinition;

    /** Converts a price from an Openfeed message to a number; `null` when the message has none. */
    price(raw: Long): number;
    /** Converts a price from an Openfeed message to a number; `null` when the message has none. */
    price(raw: Long | undefined): number | null;
    /** Converts a quantity from an Openfeed message to a number; `null` when the message has none. */
    quantity(raw: Long): number;
    /** Converts a quantity from an Openfeed message to a number; `null` when the message has none. */
    quantity(raw: Long | undefined): number | null;
    /**
     * Formats a price in the instrument's own format.
     *
     * @param price - The price; `null` and `undefined` give `""`.
     * @param notation - `native` (the default) for the instrument's own notation, such as `"112-16"`, or `decimal` for
     * `"112.50000"`.
     * @returns The formatted price.
     */
    formatPrice(price: number | null | undefined, notation?: PriceNotation): string;
    /**
     * Reads a price written in the instrument's own format, the reverse of `formatPrice`. Commas as thousands separators
     * are allowed.
     *
     * A fraction with a subdenominator ends in one digit for the part of the unit, as `formatPrice` writes it: in
     * quarter 32nds, `"104-002"` is 104 and ¼ of a 32nd. So formatted prices parse back exactly. A last digit
     * `formatPrice` never writes reads as tenths.
     *
     * @param text - The price as text, such as `"112-16"` or `"1,234.50"`.
     * @returns The price; `undefined` for empty text, and `NaN` for text that isn't a price.
     */
    parsePrice(text: string): number | undefined;
}

/** A Barchart futures symbol: root, month code, year (ZN, Z, 26 in ZNZ26). */
const FUTURES_SYMBOL = /^([A-Z][A-Z0-9$\-!.]{0,2})([A-Z]|[*])([0-9]{4}|[0-9]{1,2})$/;

/**
 * An option's underlying root, from the definition's Barchart underlying symbol; undefined for anything else. An
 * option is a definition with an option type; an equity option's root is its instrument group, never a treasury, so
 * it's left out.
 */
const getOptionUnderlyingRoot = (definition: InstrumentDefinition): string | undefined => {
    if (definition.optionType === InstrumentDefinition_OptionType.UNKNOWN_OPTION_TYPE) {
        return undefined;
    }
    if (definition.instrumentType === InstrumentDefinition_InstrumentType.EQUITY_OPTION) {
        return undefined;
    }
    return FUTURES_SYMBOL.exec(definition.underlying)?.[1];
};

/**
 * Underlying roots of the treasury options, which are written in 64ths. Their futures can have the same denominator and
 * are written in parts of a 32nd, so the definition's price format alone can't tell them apart.
 */
const TREASURY_OPTION_ROOTS = ["ZB", "ZN", "UD", "TN", "ZT", "ZF"];

const getPriceFormat = (definition: InstrumentDefinition, log: SdkLogger): PriceFormat => {
    const { priceFormat, priceScalingExponent } = definition;
    if (!priceFormat) {
        log.warn("Unknown price format for", definition.symbols.map((s) => s.symbol).join(", "));
        return {
            priceScaling: 1,
        };
    }

    if (!priceFormat.isFractional) {
        let priceScaling = 1;

        if (priceScalingExponent !== 0) {
            if (priceScalingExponent < 0) {
                priceScaling /= 10 ** -priceScalingExponent;
            } else {
                priceScaling *= 10 ** priceScalingExponent;
            }
        }
        const numDecimals = Math.log10(priceFormat.denominator);
        return { numDecimals, priceScaling };
    }

    // Anything finer than the base is written as parts of it: in 32nds, 64 is half 32nds; in 64ths, 128 is half 64ths
    const base = TREASURY_OPTION_ROOTS.includes(getOptionUnderlyingRoot(definition) ?? "") ? 64 : 32;
    const { denominator, subDenominator } = priceFormat;
    const fraction =
        denominator > base ? { denominator: base, subdenominator: denominator / base } : { denominator, subdenominator: subDenominator || 1 };
    return { priceScaling: 1, fraction };
};

/** The protocol-derived part of an instrument: scaling, price format and price formatting. */
export const createInstrument = (definition: InstrumentDefinition, log: SdkLogger): Instrument => {
    const format = getPriceFormat(definition, log);

    const priceDenominator = definition.priceDenominator === 0 ? 1 : definition.priceDenominator;
    const quantityDenominator = definition.quantityDenominator === 0 ? 1 : definition.quantityDenominator;

    return {
        marketId: definition.marketId.toString(),
        symbol: definition.symbol,
        description: definition.description,
        instrumentType: definition.instrumentType,
        exchangeCode: definition.exchangeCode,
        timeZoneName: definition.timeZoneName,
        bookDepth: definition.bookDepth,
        minimumPriceIncrement: definition.minimumPriceIncrement,
        priceFormat: format,
        definition,

        // one implementation for both overloads, which TypeScript can't check against an arrow function
        price: ((raw: Long | undefined) =>
            raw === undefined ? null : (raw.toNumber() / priceDenominator) * format.priceScaling) as Instrument["price"],
        // getIntegerPart was verified by comparing previous volume of ^BTCUSD and the like
        quantity: ((raw: Long | undefined) =>
            raw === undefined ? null : getIntegerPart(raw.toNumber() / quantityDenominator)) as Instrument["quantity"],
        formatPrice: (price, notation) => (notation === "decimal" ? formatPriceDecimal(price, format) : formatPrice(price, format)),
        parsePrice: (text) => priceToNumber(text, format),
    };
};
