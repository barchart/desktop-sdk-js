// Keeps a volume-at-price table of its own from cumulative volume's changed levels.

import { DesktopSdk } from "@barchart/desktop-sdk-js";

const sdk = new DesktopSdk();
sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });

const volumeAtPrice = new Map<number, number>();

sdk.subscribeCumulativeVolume("ESZ26", {
    onEvent({ kind, changed, levels }) {
        // On `initial` and `snapshot`, `changed` is every level, and levels not in it are gone.
        if (kind !== "update") {
            volumeAtPrice.clear();
        }
        for (const { price, volume } of changed) {
            volumeAtPrice.set(price, volume);
        }
        // `levels` is the SDK's own table, ascending by price; a consumer that needs no table of its own reads it.
        console.log(`${String(changed.length)} of ${String(levels.length)} levels changed`);
    },
});
