// Internal: the best bid and offer of a formatted quote (formatted-quote.ts).
import { formatQuantity, View, type FormattedFields } from "./formatted-view";
import type { PriceNotation } from "./instrument";
import type { BestBidOfferRecord } from "./reducers/quote";

// one getter per line, so the fields read as a table
// prettier-ignore
export class BestBidOfferView extends View<BestBidOfferRecord> implements FormattedFields<BestBidOfferRecord> {
    // prices

    get bidPrice() { return this.price(this.record.bidPrice); }
    get askPrice() { return this.price(this.record.askPrice); }

    // quantities

    get bidSize() { return formatQuantity(this.record.bidSize); }
    get askSize() { return formatQuantity(this.record.askSize); }
    get bidOrderCount() { return formatQuantity(this.record.bidOrderCount); }
    get askOrderCount() { return formatQuantity(this.record.askOrderCount); }

    protected inNotation(notation: PriceNotation) {
        return new BestBidOfferView(this.record, this.instrument, notation);
    }
}
