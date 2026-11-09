import { InstrumentDefinition_InstrumentType as T, InstrumentDefinition_OptionType as O } from "@openfeed/sdk-js";
import { describe, expect, it } from "vitest";
import { createInstrument } from "../src/instrument";
import { definition, fractionFormat, quiet } from "./helpers";

const thirtySeconds = fractionFormat(32);
const sixtyFourths = fractionFormat(64);
const halfSixtyFourths = fractionFormat(128);

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
        expect(fraction(T.OPTION, underlying, sixtyFourths)).toEqual({ denominator: 64, subdenominator: 1 });
    });

    it.each(["ZTZ26", "ZFZ26"])("formats %s options in half 64ths", (underlying) => {
        expect(fraction(T.OPTION, underlying, halfSixtyFourths)).toEqual({ denominator: 64, subdenominator: 2 });
    });

    it("formats futures with the same denominators in parts of a 32nd", () => {
        expect(fraction(T.FUTURE, "", sixtyFourths)).toEqual({ denominator: 32, subdenominator: 2 });
        expect(fraction(T.FUTURE, "", halfSixtyFourths)).toEqual({ denominator: 32, subdenominator: 4 });
        expect(fraction(T.EQUITY_OPTION, "ZNZ26", sixtyFourths)).toEqual({ denominator: 32, subdenominator: 2 });
        expect(fraction(T.OPTION, "ZNZ26", sixtyFourths, O.UNKNOWN_OPTION_TYPE)).toEqual({ denominator: 32, subdenominator: 2 });
    });

    it("leaves coarser formats to the definition", () => {
        expect(fraction(T.FUTURE, "")).toEqual({ denominator: 32, subdenominator: 1 });
        expect(fraction(T.OPTION, "ZCZ26", fractionFormat(8))).toEqual({ denominator: 8, subdenominator: 1 });
        expect(fraction(T.OPTION, "ZNZ26")).toEqual({ denominator: 32, subdenominator: 1 });
        expect(fraction(T.FUTURE, "", fractionFormat(32, 4))).toEqual({ denominator: 32, subdenominator: 4 });
    });

    it("reads an option by its option type", () => {
        expect(fraction(T.UNKNOWN_INSTRUMENT_TYPE, "ZTZ26", halfSixtyFourths, O.PUT)).toEqual({ denominator: 64, subdenominator: 2 });
    });

    it("formats in 64ths", () => {
        const zn = createInstrument(
            definition({
                instrumentType: T.OPTION,
                optionType: O.CALL,
                underlying: "ZNZ26",
                priceFormat: sixtyFourths,
            }),
            quiet
        );
        expect(zn.formatPrice(1.515625)).toBe("1-33");
    });
});
