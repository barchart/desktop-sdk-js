// Logs a quote's last price and best bid and offer as they change.

import { DesktopSdk } from "@barchart/desktop-sdk-js";

const delay = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const sdk = new DesktopSdk({ logger: console });
sdk.onConnectionState((state) => {
    console.log("connection:", state);
});
// The Barchart Desktop API, signed in with your Barchart Desktop credentials
sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });

const subscription = sdk.subscribeQuote("ESZ26", {
    onEvent({ kind, instrument, quote, formatted }) {
        // `initial` once, with the state the SDK already had; then `snapshot` or `update` per change
        console.log(kind, instrument.symbol, formatted.session.last, quote.session.volume);
        console.log("bid", formatted.bestBidOffer.bidPrice, "x", formatted.bestBidOffer.bidSize);
        console.log("ask", formatted.bestBidOffer.askPrice, "x", formatted.bestBidOffer.askSize);
    },
    onError(error) {
        console.error(error.symbol, error.message);
    },
});

// Events for a minute. The state is also there to read between events: undefined until the SDK has it.
await delay(60_000);
console.log("last after a minute:", sdk.getQuote("ESZ26")?.session.last);

// No callback arrives after close() returns.
subscription.close();
sdk.dispose();
