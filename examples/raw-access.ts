// What the SDK doesn't model: raw subscriptions, one-off snapshots and instrument lookups.

import { DesktopSdk } from "@barchart/desktop-sdk-js";
import { SubscriptionType } from "@openfeed/sdk-js";

const delay = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const sdk = new DesktopSdk();
sdk.onConnectionState((state) => {
    if (state === "credentials-rejected") {
        console.error("Sign in with the credentials Barchart Desktop is signed in with.");
    }
});
sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });

// Any Openfeed subscription, with its raw messages and no SDK state or events.
const trades = sdk.raw.subscribe("ESZ26", SubscriptionType.TRADES, {
    onMessage(message) {
        for (const entry of message.marketUpdate?.trades?.trades ?? []) {
            console.log("trade", entry.trade?.price.toString(), entry.trade?.quantity.toString());
        }
    },
    onError(error) {
        console.error(error.message);
    },
});

try {
    // Rejects on rejected credentials; the snapshot below would wait for a connection that never comes.
    await sdk.whenConnected();

    // One snapshot, then the subscription closes. Rejects with a SubscriptionError if the server refuses it.
    const { instrumentDefinition, marketSnapshot } = await sdk.raw.requestSnapshot("ZCZ26");
    console.log(instrumentDefinition?.description, marketSnapshot.marketId.toString());

    // The gateway's instrument lookup. The request goes out as given, so its lists are needed even when empty. Rejects
    // with an InstrumentLookupError if the server refuses it or finds nothing.
    const definitions = await sdk.raw.lookupInstruments({ symbol: "ZC*1", instrumentType: [], spreadType: [] });
    console.log(definitions.map((definition) => definition.symbol));

    // Trades for a minute.
    await delay(60_000);
} catch (error: unknown) {
    console.error(error);
} finally {
    // Then everything closes, whatever happened.
    trades.close();
    sdk.dispose();
}
