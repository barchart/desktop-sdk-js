// On a busy feed, at most one event per subscription every 100 ms, each with the latest state.

import { DesktopSdk } from "@barchart/desktop-sdk-js";

const sdk = new DesktopSdk({ coalesceIntervalMs: 100 });
sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });

for (const symbol of ["ESZ26", "NQZ26", "ZNZ26", "CLZ26"]) {
    sdk.subscribeQuote(symbol, {
        onEvent({ formatted }) {
            console.log(symbol, formatted.session.last);
        },
        // Raw messages aren't held: this runs for each message, and can come before the event that covers it.
        onMessage(message) {
            if (message.marketUpdate?.trades) {
                console.log(symbol, "traded");
            }
        },
    });
}
