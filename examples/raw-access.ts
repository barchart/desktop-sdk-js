// What the SDK doesn't model: raw subscriptions, one-off snapshots and instrument lookups.

import { DesktopSdk } from "@barchart/desktop-sdk-js";
import { SubscriptionType } from "@openfeed/sdk-js";

const delay = (ms: number) =>
    new Promise((resolve) => {
        setTimeout(resolve, ms);
    });

const sdk = new DesktopSdk();
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

// One snapshot, then the subscription closes.
const { instrumentDefinition, marketSnapshot } = await sdk.raw.requestSnapshot("ZCZ26");
console.log(instrumentDefinition?.description, marketSnapshot.marketId.toString());

// The gateway's instrument lookup.
const definitions = await sdk.raw.lookupInstruments({ symbol: "ZC*1" });
console.log(definitions.map((definition) => definition.symbol));

// Trades for a minute, then everything closes.
await delay(60_000);
trades.close();
sdk.dispose();
