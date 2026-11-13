/**
 * A trading session's date, as the exchange counts it. It has no time and no time zone, so it isn't a `Date`: a
 * session that starts on Sunday evening can trade on Monday's date.
 */
export class TradeDate {
    private constructor(
        /** The year, such as 2026. */
        readonly year: number,
        /** The month, 1 to 12. */
        readonly month: number,
        /** The day of the month, 1 to 31. */
        readonly day: number
    ) {}

    /**
     * Reads a date in Openfeed's `tradeDate` form.
     *
     * @param yyyymmdd - The date as a number, such as `20261112`; 0 and `undefined` mean "not set".
     * @returns The date, or `null` when it isn't set.
     */
    static fromProto(yyyymmdd: number | undefined): TradeDate | null {
        if (!yyyymmdd) {
            return null;
        }
        return new TradeDate(Math.floor(yyyymmdd / 10000), Math.floor(yyyymmdd / 100) % 100, yyyymmdd % 100);
    }

    /**
     * Whether two dates are the same day.
     *
     * @param other - The date to compare with; `null` is never equal.
     */
    equals(other: TradeDate | null): boolean {
        return other !== null && other.year === this.year && other.month === this.month && other.day === this.day;
    }

    /** The date as `YYYY-MM-DD`, such as `2026-11-12`. */
    toString(): string {
        return `${String(this.year)}-${String(this.month).padStart(2, "0")}-${String(this.day).padStart(2, "0")}`;
    }
}
