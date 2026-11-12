// Price formats and formatting. formatPrice and formatDecimal are public, for prices shown in a format of the user's
// choosing; an instrument formats in its own format with instrument.formatPrice.

/**
 * How an instrument's prices are written: a fixed number of decimals, or a fraction such as 32nds. An instrument's
 * comes from its definition (`instrument.priceFormat`); {@link formatPrice} takes one you choose.
 */
export interface PriceFormat {
    /** Decimal notation with this many decimals. Takes precedence over `fraction`. */
    numDecimals?: number;
    /**
     * What the instrument's prices are multiplied by when the SDK reads them from the feed. Formatting doesn't use it:
     * the prices it formats are already scaled.
     */
    priceScaling: number;

    /** Fractional notation, `112-16` for 112 and 16/32. */
    fraction?: {
        /** The fraction's unit: 32 for 32nds. */
        denominator: number;
        /**
         * Parts of each unit, written as one more digit: 2 for half 32nds, so 112 and 16.5/32 is `112-165`. 1 for
         * none.
         */
        subdenominator: number;
    };
}

export const getIntegerPart = (value: number) => Math.floor(value);

const getDecimalPart = (value: number) => {
    const abs = Math.abs(value);
    return abs - Math.floor(abs);
};

const toFixedNumber = (num: number, digits: number) => {
    const pow = 10 ** digits;
    return Math.round(num * pow) / pow;
};

/**
 * Adds thousands separators to a decimal number's text.
 *
 * @param value - The number as text, such as `price.toFixed(2)`.
 * @param thousandsSeparator - The separator to add, `","` by default.
 * @param decimalSeparator - The decimal separator `value` uses, `"."` by default. It's kept as is.
 * @returns The text with separators: `"1250.5"` becomes `"1,250.5"`.
 *
 * @example
 * ```ts
 * formatDecimal("1234567.25"); // "1,234,567.25"
 * formatDecimal("1234567,25", ".", ","); // "1.234.567,25"
 * ```
 */
export const formatDecimal = (value: string, thousandsSeparator = ",", decimalSeparator = ".") => {
    const [integerPart, decimalPart] = value.split(decimalSeparator);
    return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator)}${decimalPart ? decimalSeparator : ""}${decimalPart || ""}`;
};

/**
 * Formats a price in a format you choose. To format in an instrument's own format, use its `formatPrice` instead.
 *
 * @param price - The price. `null` and `undefined` give `""`.
 * @param format - A fixed number of decimals (`numDecimals`, with thousands separators) or a fraction (`fraction`,
 * as in "112-16" for 112 and 16/32). With neither, the number as is.
 * @returns The formatted price.
 *
 * @example
 * ```ts
 * formatPrice(1234.5, { numDecimals: 2, priceScaling: 1 }); // "1,234.50"
 * formatPrice(112.5, { fraction: { denominator: 32, subdenominator: 1 }, priceScaling: 1 }); // "112-16"
 * formatPrice(112.515625, { fraction: { denominator: 32, subdenominator: 2 }, priceScaling: 1 }); // "112-165"
 * formatPrice(null, { numDecimals: 2, priceScaling: 1 }); // ""
 * ```
 */
export const formatPrice = (price: number | null | undefined, format: PriceFormat) => {
    if (price === null || price === undefined) {
        return "";
    }

    if (format.numDecimals !== undefined) {
        return formatDecimal(price.toFixed(format.numDecimals));
    }
    if (format.fraction) {
        const { denominator, subdenominator } = format.fraction;
        const subDenominatorShift = subdenominator > 1 ? 1 : 0;

        // of the absolute value: a negative value's floor is one lower
        const integerPart = getIntegerPart(Math.abs(price));
        const decimalPart = getDecimalPart(price);

        const formulaResult = toFixedNumber((decimalPart / (1 / denominator)) * 10 ** subDenominatorShift, 1);

        let formatDigits = 3;
        if (denominator * subdenominator === 32 || denominator === 64) {
            formatDigits = 2;
        } else if (denominator * subdenominator < 32) {
            formatDigits = 1;
        }

        const formatted = String(getIntegerPart(formulaResult)).padStart(formatDigits, "0");

        const sign = price < 0 ? "-" : "";
        return `${sign}${String(integerPart)}-${formatted}`;
    }

    return price.toString();
};

const getDecimalCount = (format: PriceFormat): number | undefined => {
    if (format.numDecimals !== undefined) {
        return format.numDecimals;
    }
    if (!format.fraction) {
        return undefined;
    }
    const unit = 1 / (format.fraction.denominator * format.fraction.subdenominator);
    let decimals = 0;
    while (decimals < 12 && Math.abs(unit * 10 ** decimals - Math.round(unit * 10 ** decimals)) > 1e-9) {
        decimals += 1;
    }
    return decimals;
};

/**
 * Decimal notation, whatever the format's own: as many decimals as its increment needs (a fraction's smallest part
 * exactly: 1/32 → 5, 1/64 → 6), with thousands separators. Unknown formats get the number as is.
 */
export const formatPriceDecimal = (price: number | null | undefined, format: PriceFormat) => {
    if (price === null || price === undefined) {
        return "";
    }
    const decimals = getDecimalCount(format);
    return decimals === undefined ? price.toString() : formatDecimal(price.toFixed(decimals));
};

/**
 * With a subdenominator, formatPrice writes a fraction's last digit as the first decimal digit of its sub-fraction
 * (quarters of a 32nd: ¼ → 2, ½ → 5, ¾ → 7). The sub-fraction a digit stands for, or undefined for a digit it never
 * writes.
 */
const getSubFraction = (digit: number, subdenominator: number): number | undefined => {
    for (let k = 0; k < subdenominator; k += 1) {
        if (Math.floor((k / subdenominator) * 10) === digit) {
            return k / subdenominator;
        }
    }
    return undefined;
};

export const priceToNumber = (price: string, format: PriceFormat) => {
    if (!price) {
        return undefined;
    }

    const cleanPrice = price.replaceAll(",", "");

    if (format.numDecimals !== undefined) {
        return parseFloat(cleanPrice);
    }
    if (format.fraction) {
        const isNegative = cleanPrice.startsWith("-");
        const priceValue = isNegative ? cleanPrice.substring(1) : cleanPrice;
        const sign = isNegative ? -1 : 1;
        const { denominator, subdenominator } = format.fraction;
        const subDenominatorShift = subdenominator > 1 ? 1 : 0;

        const [integerPart, decimalPart] = priceValue.split("-");

        const [parsedIntegerPart, parsedDecimalPart] = [parseInt(integerPart, 10), parseInt(decimalPart, 10)];
        if (Number.isNaN(parsedIntegerPart) || Number.isNaN(parsedDecimalPart)) {
            return parseFloat(cleanPrice);
        }

        // the last digit as formatPrice writes it (2 is ¼ in quarter 32nds); a digit it never writes reads as tenths
        const subFraction = subDenominatorShift > 0 && parsedDecimalPart >= 0 ? getSubFraction(parsedDecimalPart % 10, subdenominator) : undefined;
        const units =
            subFraction === undefined ? parsedDecimalPart * (1 / 10 ** subDenominatorShift) : Math.floor(parsedDecimalPart / 10) + subFraction;
        const formulaResult = (parsedIntegerPart * denominator + units) / denominator;

        return sign * formulaResult;
    }
    return parseFloat(cleanPrice);
};
