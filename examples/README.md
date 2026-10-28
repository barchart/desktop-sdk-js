# Examples

Short programs, one task each. They connect to the Barchart Desktop API on `ws://localhost:9000`; put in your Barchart Desktop credentials to run them.

- [quotes.ts](quotes.ts): a quote's last price and best bid and offer, as they change.
- [order-book.ts](order-book.ts): the order book, rendered on each change.
- [cumulative-volume.ts](cumulative-volume.ts): a volume-at-price table kept from the changed levels.
- [coalescing.ts](coalescing.ts): at most one event per subscription per interval, on a busy feed.
- [connection.ts](connection.ts): logging in and out, rejected credentials, heartbeats, disposing.
- [raw-access.ts](raw-access.ts): raw subscriptions, one-off snapshots and instrument lookups.

The [reference](../docs/reference.md) has every method and shape they use.
