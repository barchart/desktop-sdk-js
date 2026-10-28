# @barchart/desktop-sdk-js

Market state from an Openfeed connection, ready to use. The SDK subscribes, applies snapshots and updates, keeps quotes, order books and cumulative volume per instrument, and tells you when they change. You don't apply Openfeed messages yourself.

It runs on top of [`@openfeed/sdk-js`](https://github.com/openfeed-org/sdk-js), the Openfeed client. Point it at the **Barchart Desktop API** on your machine, signed in with your Barchart Desktop credentials, or at an Openfeed gateway directly.

```ts
import { DesktopSdk } from "@barchart/desktop-sdk-js";

const sdk = new DesktopSdk();
sdk.login({ url: "ws://localhost:9000", username, password });

sdk.subscribeQuote("ESZ26", {
    onEvent({ quote, formatted }) {
        console.log(quote.session.last, formatted.session.last); // 6012.25 "6,012.25"
    },
    onError(error) {
        console.error(error.symbol, error.message);
    },
});
```

## Install

```sh
npm install @barchart/desktop-sdk-js @openfeed/sdk-js long
```

`@openfeed/sdk-js` and `long` are peer dependencies: your application and the SDK share one Openfeed client and one copy of the protocol types.

## Connecting

One `DesktopSdk` lives as long as your application. Logging in and out are states of it, not its lifetime:

```ts
const sdk = new DesktopSdk({ logger: console }); // logger is optional
sdk.onConnectionState((state) => console.log(state));
sdk.login({ url, username, password });
await sdk.whenConnected();

sdk.logout(); // subscriptions stay, and are sent again at the next login
sdk.dispose(); // closes everything
```

To get at most one event per subscription per interval on a busy feed, instead of one per message, pass `coalesceIntervalMs`: `new DesktopSdk({ coalesceIntervalMs: 100 })`. Each event then carries the latest state.

The connection state is `logged-out`, `connecting`, `connected`, `disconnected` or `credentials-rejected`. The Openfeed client reconnects and resubscribes by itself after a lost connection. Rejected credentials are final until the next `login`.

**The Barchart Desktop API.** Turn it on in Barchart Desktop's settings; it listens on port 9000 unless you change it there. Sign in with the username and password Barchart Desktop is signed in with; other credentials are rejected. While Barchart Desktop isn't connected to its feed, logins wait up to 5 seconds and then fail, and the client retries.

## Subscribing

| Method | You get | On each change |
|---|---|---|
| `subscribeQuote(symbol, listener, service?)` | `QuoteEvent`: `quote`, `formatted` | a snapshot, or an update that changed the quote |
| `subscribeDepth(symbol, listener, service?)` | `BookEvent`: `book` (the whole book) | a snapshot with depth, or a depth update |
| `subscribeCumulativeVolume(symbol, listener, service?)` | `CumulativeVolumeEvent`: `levels`, `changed` | trades that changed the volume at a price |

Every event also has `symbol`, `instrument`, `kind` and `raw`, the Openfeed message that caused it. `kind` is:

- **`initial`:** the state the SDK already had, delivered once to a new subscriber;
- **`snapshot`:** a snapshot was just applied;
- **`update`:** an update was just applied.

Each method returns a `Subscription`, with its `state` (`pending`, `active`, `error`, `closed`), its `error`, and `close()`:

```ts
const sub = sdk.subscribeDepth("ESZ26", {
    onEvent({ book }) {
        render(book.bids, book.asks);
    },
});
// later
sub.close();
```

- **Your callbacks never run inside `subscribe`.** The first one comes after it has returned, so you can set things up after subscribing.
- **Subscribing to the same symbol twice is free.** Subscriptions share one Openfeed subscription, and a new subscriber gets the current state as an `initial` event.
- **Errors are the server's.** `onError` gets a `SubscriptionError` with the protocol's `result` and message. Later subscribers to the same symbol get it too, without asking the server again.
- **Wildcard symbols follow rolls.** `ZC*1` keeps pointing at the front contract; after a roll, the new contract arrives as a `snapshot` event with the new `instrument`.

The service defaults to real time (`Service.REAL_TIME` from `@openfeed/sdk-js`); cumulative volume defaults to `Service.REAL_TIME_SNAPSHOT`.

## Reading state

Each symbol's current state, as the last event delivered it:

```ts
sdk.getInstrument("ESZ26"); // Instrument
sdk.getQuote("ESZ26"); // QuoteRecord
sdk.getFormattedQuote("ESZ26"); // FormattedQuote
sdk.getBook("ESZ26"); // Book
sdk.getCumulativeVolume("ESZ26"); // { price, volume }[], ascending by price
```

They return `undefined` until the SDK has the state. Everything they and the events return is **immutable**: frozen objects that you can keep, compare by identity and pass around. The dates in a quote are `Date` objects; treat them as read-only too.

### Quotes

A `QuoteRecord` is what the feed sent, scaled to real prices, in the protocol's groups:

- **`session` and `previousSession`:** `open`, `high`, `low`, `close`, `settle`, `last`, `lastSize`, `volume`, `openInterest`, `numberOfTrades`, and more, each with its time and trade date;
- **`bestBidOffer`:** `bidPrice`, `bidSize`, `bidOrderCount`, `askPrice`, `askSize`, `askOrderCount`;
- **`status`:** the trading status codes, and when they changed.

`null` means the feed hasn't sent a field. A group is a new object only when a message changed it.

### Formatting

`formatted` is the quote as strings, in the instrument's own notation, and in decimal:

```ts
formatted.session.last; // "112-16", for an instrument priced in 32nds
formatted.session.decimal.last; // "112.50000"
formatted.bestBidOffer.bidSize; // "1,250"
{ ...formatted.session.values }; // every field, as a plain object
JSON.stringify(formatted); // every group's values
```

A field is formatted when you read it. Dates aren't formatted, since that needs your time zone and locale. To format a price yourself:

```ts
import { formatPrice } from "@barchart/desktop-sdk-js";

instrument.formatPrice(112.5); // "112-16"
instrument.formatPrice(112.5, "decimal"); // "112.50000"
formatPrice(112.5, { priceScaling: 1, numDecimals: 2 }); // "112.50", in a format you pick
```

## Raw access and diagnostics

For what the SDK doesn't model:

- **`sdk.raw.subscribe(symbol, type, listener?, service?)`:** any Openfeed subscription, with its raw messages.
- **`sdk.raw.requestSnapshot(symbol)`:** one snapshot, as a promise.
- **`sdk.raw.onMessage(listener)`:** every message, after the SDK applied it.
- **`sdk.raw.send(request)`:** sends a request the SDK doesn't model.
- **`sdk.raw.lookupInstruments(request)`:** the gateway's instrument lookup.

A listener can also take its subscription's raw messages with `onMessage`, next to `onEvent`.

`sdk.diagnostics` has the connection token, a symbol's last snapshot and update, and every subscription's state, for support and debugging.

## Documentation

- [Reference](docs/reference.md): every public method, the shapes they return, and the delivery guarantees.
- [Examples](examples/): short programs, one task each.
- [Changelog](CHANGELOG.md): what changed in each release.
- [Design](docs/design.md): how the SDK works inside, for contributors and for ports to other languages.
- [Openfeed](https://openfeed.com/): the protocol, its services and messages, and the [Openfeed client](https://github.com/openfeed-org/sdk-js).

## License

See [LICENSE](LICENSE).
