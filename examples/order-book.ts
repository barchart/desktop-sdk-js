// Renders the order book on each change, with every price in the instrument's own notation.

import { DesktopSdk, type Book, type Instrument } from "@barchart/desktop-sdk-js";

const sdk = new DesktopSdk();
sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });

const render = (book: Book, instrument: Instrument) => {
    // Each side is `bookDepth` long; an empty level is { price: 0, size: 0 }.
    const rows = book.bids.map((bid, i) => {
        const ask = book.asks[i];
        return [
            bid.size > 0 ? `${String(bid.size)} @ ${instrument.formatPrice(bid.price)}` : "",
            ask.size > 0 ? `${instrument.formatPrice(ask.price)} @ ${String(ask.size)}` : "",
        ].join(" | ");
    });
    console.log(rows.join("\n"));
};

sdk.subscribeDepth("ZNZ26", {
    // The event carries the whole book, so a render needs nothing else.
    onEvent({ book, instrument }) {
        render(book, instrument);
    },
});
