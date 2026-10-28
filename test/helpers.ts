// Builders for protocol messages in tests: only the fields the SDK reads, cast to the generated types.
import {
    type AddPriceLevel,
    type BookSide,
    type InstrumentDefinition,
    InstrumentDefinition_InstrumentType,
    InstrumentDefinition_OptionType,
    type InstrumentDefinition_PriceFormat,
    type OpenfeedGatewayMessage,
} from "@openfeed/sdk-js";
import Long from "long";
import type { SdkLogger } from "../src";

/** Does nothing, for callbacks a test doesn't watch. */
export const ignore = (): void => undefined;

export const quiet: SdkLogger = { log: ignore, warn: ignore, error: ignore };

export const toLong = (n: number) => Long.fromNumber(n);

export const sleep = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

/** The value, failing the test when it's missing. */
export const defined = <T>(value: T | null | undefined): T => {
    if (value === null || value === undefined) {
        throw new Error("Expected a value");
    }
    return value;
};

export const message = (fields: object) => fields as OpenfeedGatewayMessage;

export const decimalFormat = (denominator: number) => ({ isFractional: false, denominator, subDenominator: 0 }) as InstrumentDefinition_PriceFormat;

export const fractionFormat = (denominator: number, subDenominator = 0) =>
    ({ isFractional: true, denominator, subDenominator }) as InstrumentDefinition_PriceFormat;

export interface DefinitionFields {
    marketId?: number;
    symbol?: string;
    priceFormat?: InstrumentDefinition_PriceFormat;
    priceDenominator?: number;
    bookDepth?: number;
    instrumentType?: InstrumentDefinition_InstrumentType;
    optionType?: InstrumentDefinition_OptionType;
    underlying?: string;
}

export const definition = (fields: DefinitionFields = {}): InstrumentDefinition =>
    ({
        marketId: toLong(fields.marketId ?? 42),
        symbol: fields.symbol ?? "ESZ26",
        symbols: [],
        instrumentType: fields.instrumentType ?? InstrumentDefinition_InstrumentType.FUTURE,
        optionType: fields.optionType ?? InstrumentDefinition_OptionType.UNKNOWN_OPTION_TYPE,
        underlying: fields.underlying ?? "",
        priceDenominator: fields.priceDenominator ?? 100,
        quantityDenominator: 1,
        priceScalingExponent: 0,
        bookDepth: fields.bookDepth ?? 5,
        description: "",
        timeZoneName: "America/Chicago",
        priceFormat: fields.priceFormat ?? decimalFormat(100),
    }) as unknown as InstrumentDefinition;

export const level = (side: BookSide, n: number, price: number, quantity: number) =>
    ({ side, level: n, price: toLong(price), quantity: toLong(quantity), orderCount: 0 }) as unknown as AddPriceLevel;

/** `[price, volume]` pairs, for comparing cumulative volume levels. */
export const pairs = (levels: readonly { price: number; volume: number }[]) => levels.map((l) => [l.price, l.volume]);
