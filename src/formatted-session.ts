// Internal: a session of a formatted quote (formatted-quote.ts).
import { formatQuantity, View, type FormattedFields } from "./formatted-view";
import type { PriceNotation } from "./instrument";
import type { SessionRecord } from "./reducers/quote";

// one getter per line, so the fields read as a table
// prettier-ignore
export class SessionView extends View<SessionRecord> implements FormattedFields<SessionRecord> {
    // prices

    get open() { return this.price(this.record.open); }
    get high() { return this.price(this.record.high); }
    get low() { return this.price(this.record.low); }
    get close() { return this.price(this.record.close); }
    get settle() { return this.price(this.record.settle); }
    get prevSettle() { return this.price(this.record.prevSettle); }
    get last() { return this.price(this.record.last); }
    get lastTrade() { return this.price(this.record.lastTrade); }

    // quantities

    get lastSize() { return formatQuantity(this.record.lastSize); }
    get volume() { return formatQuantity(this.record.volume); }
    get openInterest() { return formatQuantity(this.record.openInterest); }
    get numberOfTrades() { return formatQuantity(this.record.numberOfTrades); }

    protected inNotation(notation: PriceNotation) {
        return new SessionView(this.record, this.instrument, notation);
    }
}
