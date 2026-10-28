// The connection's lifetime: one SDK for the application, logins and logouts as states of it.

import { DesktopSdk } from "@barchart/desktop-sdk-js";

const sdk = new DesktopSdk({ logger: console });

sdk.onConnectionState((state) => {
    // Rejected credentials are final until the next login; the Openfeed client retries a lost connection by itself.
    if (state === "credentials-rejected") {
        console.error("Sign in with the credentials Barchart Desktop is signed in with.");
    }
});
sdk.onHeartbeat((serverTime) => {
    console.log("server time", serverTime?.toISOString());
});

// Subscriptions made while logged out stay `pending`, and are sent at login.
const subscription = sdk.subscribeQuote("ESZ26", {
    onEvent: ({ quote }) => {
        console.log(quote.session.last);
    },
});
// "pending"
console.log(subscription.state);

sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });
try {
    await sdk.whenConnected();
} catch (error) {
    // rejected credentials, or the SDK disposed first
    console.error(error);
}

// Logging out clears the market state but keeps the subscriptions, which are sent again at the next login.
sdk.logout();
sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });

// Closes everything, when the application ends.
sdk.dispose();
