// The connection's lifetime: one SDK for the application, logins and logouts as states of it.

import { DesktopSdk } from "@barchart/desktop-sdk-js";

const delay = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

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
const connected = await sdk.whenConnected().then(
    () => true,
    (error: unknown) => {
        // rejected credentials, or the SDK disposed first
        console.error(error);
        return false;
    }
);

if (connected) {
    // Quotes and heartbeats for half a minute.
    await delay(30_000);

    // Logging out clears the market state but keeps the subscriptions, which are sent again at the next login.
    sdk.logout();
    sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });
    await delay(30_000);
}

// Closes everything, when the application ends.
sdk.dispose();
