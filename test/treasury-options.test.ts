import { InstrumentDefinition_InstrumentType as T, InstrumentDefinition_OptionType as O } from "@openfeed/sdk-js";
import { describe, expect, it } from "vitest";
import { createInstrument } from "../src/instrument";
import { definition, fractionFormat, quiet } from "./helpers";

const thirtySeconds = fractionFormat(32);

const fraction = (instrumentType: T, underlying: string, priceFormat = thirtySeconds, optionType?: O) => {
    const d = definition({
        instrumentType,
        underlying,
        priceFormat,
        priceDenominator: 1000000,
        optionType: optionType ?? (instrumentType === T.FUTURE ? O.UNKNOWN_OPTION_TYPE : O.CALL),
    });
    return createInstrument(d, quiet).priceFormat.fraction;
};

describe("treasury options' price format", () => {
    it.each(["ZNZ26", "ZBH7", "UDM26", "TNU26"])("formats %s options in 64ths", (underlying) => {
        expect(fraction(T.OPTION, underlying)).toEqual({ denominator: 64, subdenominator: 1 });
    });

    it.each(["ZTZ26", "ZFZ26"])("formats %s options in half 64ths", (underlying) => {
        expect(fraction(T.OPTION, underlying)).toEqual({ denominator: 64, subdenominator: 2 });
    });

    it("leaves everything else to the definition's price format", () => {
        expect(fraction(T.FUTURE, "")).toEqual({ denominator: 32, subdenominator: 1 });
        expect(fraction(T.OPTION, "ZCZ26", fractionFormat(8))).toEqual({ denominator: 8, subdenominator: 1 });
        expect(fraction(T.EQUITY_OPTION, "ZNZ26")).toEqual({ denominator: 32, subdenominator: 1 });
        expect(fraction(T.OPTION, "")).toEqual({ denominator: 32, subdenominator: 1 });
        expect(fraction(T.OPTION, "ZNZ26", thirtySeconds, O.UNKNOWN_OPTION_TYPE)).toEqual({
            denominator: 32,
            subdenominator: 1,
        });
    });

    it("reads an option by its option type", () => {
        expect(fraction(T.UNKNOWN_INSTRUMENT_TYPE, "ZNZ26", thirtySeconds, O.PUT)).toEqual({
            denominator: 64,
            subdenominator: 1,
        });
    });

    it("formats with the override", () => {
        const zn = createInstrument(
            definition({
                instrumentType: T.OPTION,
                optionType: O.CALL,
                underlying: "ZNZ26",
                priceFormat: thirtySeconds,
            }),
            quiet
        );
        expect(zn.formatPrice(1.515625)).toBe("1-33");
    });
});
