/** Exchange session date (proto `tradeDate`, YYYYMMDD): no time and no timezone, so deliberately not a Date. */
export class TradeDate {
    private constructor(
        readonly year: number,
        /** 1–12 */
        readonly month: number,
        readonly day: number
    ) {}

    /** 0 is proto3's "not set". */
    static fromProto(yyyymmdd: number | undefined): TradeDate | null {
        if (!yyyymmdd) {
            return null;
        }
        return new TradeDate(Math.floor(yyyymmdd / 10000), Math.floor(yyyymmdd / 100) % 100, yyyymmdd % 100);
    }

    equals(other: TradeDate | null): boolean {
        return other !== null && other.year === this.year && other.month === this.month && other.day === this.day;
    }

    /** "YYYY-MM-DD" */
    toString(): string {
        return `${String(this.year)}-${String(this.month).padStart(2, "0")}-${String(this.day).padStart(2, "0")}`;
    }
}
