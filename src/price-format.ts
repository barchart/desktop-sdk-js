// Price formats and formatting. formatPrice and formatDecimal are public, for prices shown in a format of the user's
// choosing; an instrument formats in its own format with instrument.formatPrice.

export interface PriceFormat {
    numDecimals?: number;
    priceScaling: number;

    fraction?: {
        denominator: number;
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

export const formatDecimal = (value: string, thousandsSeparator = ",", decimalSeparator = ".") => {
    const [integerPart, decimalPart] = value.split(decimalSeparator);
    return `${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator)}${decimalPart ? decimalSeparator : ""}${decimalPart || ""}`;
};

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
