// On a busy feed, at most one event per subscription every 100 ms, each with the latest state.

import { DesktopSdk } from "@barchart/desktop-sdk-js";

const sdk = new DesktopSdk({ coalesceIntervalMs: 100 });
sdk.onConnectionState((state) => {
    if (state === "credentials-rejected") {
        console.error("Sign in with the credentials Barchart Desktop is signed in with.");
    }
});
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
        // Errors aren't held either.
        onError(error) {
            console.error(error.message);
        },
    });
}
