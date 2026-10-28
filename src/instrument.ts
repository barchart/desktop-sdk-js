import { type InstrumentDefinition, InstrumentDefinition_InstrumentType, InstrumentDefinition_OptionType } from "@openfeed/sdk-js";
import type Long from "long";
import { formatPrice, formatPriceDecimal, getIntegerPart, priceToNumber, type PriceFormat } from "./price-format";
import type { SdkLogger } from "./types";

/** `native`: the instrument's own notation (fractional for 32nds, say: "112-16"); `decimal`: "112.50000". */
export type PriceNotation = "native" | "decimal";

export interface Instrument {
    readonly marketId: string;
    readonly symbol: string;
    readonly description: string;
    readonly instrumentType: InstrumentDefinition_InstrumentType;
    readonly exchangeCode: string;
    readonly timeZoneName: string;
    readonly bookDepth: number;
    readonly minimumPriceIncrement: number;
    readonly priceFormat: PriceFormat;
    readonly definition: InstrumentDefinition;

    /** A protocol price, scaled; null when the message has none. */
    price(raw: Long): number;
    price(raw: Long | undefined): number | null;
    /** A protocol quantity, scaled; null when the message has none. */
    quantity(raw: Long): number;
    quantity(raw: Long | undefined): number | null;
    /** In the native notation unless asked for `decimal`; "" for no price. */
    formatPrice(price: number | null | undefined, notation?: PriceNotation): string;
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

    // Treasury options are quoted in 64ths, whatever the definition's price format says
    const underlyingRoot = getOptionUnderlyingRoot(definition);
    if (underlyingRoot === "ZB" || underlyingRoot === "ZN" || underlyingRoot === "UD" || underlyingRoot === "TN") {
        return {
            priceScaling: 1,
            fraction: {
                denominator: 64,
                subdenominator: 1,
            },
        };
    }
    if (underlyingRoot === "ZT" || underlyingRoot === "ZF") {
        return {
            priceScaling: 1,
            fraction: {
                denominator: 64,
                subdenominator: 2,
            },
        };
    }

    let subdenominator = 1;
    if (priceFormat.denominator > 32) {
        subdenominator = priceFormat.denominator / 32;
    } else if (priceFormat.subDenominator !== 0) {
        subdenominator = priceFormat.subDenominator;
    }
    return {
        priceScaling: 1,
        fraction: {
            denominator: priceFormat.denominator > 32 ? 32 : priceFormat.denominator,
            subdenominator,
        },
    };
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
