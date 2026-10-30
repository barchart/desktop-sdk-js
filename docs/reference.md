# Reference

The SDK's public methods, and the shapes of what they return. The [README](../README.md) is the introduction, and the [design](design.md) explains how the SDK works inside.

Protocol names (services, subscription types, results, messages such as `OpenfeedGatewayMessage`) are Openfeed's. For what they mean and how the feed behaves, see the Openfeed documentation:

- [openfeed.com](https://openfeed.com/);
- the Openfeed client, [`@openfeed/sdk-js`](https://github.com/openfeed-org/sdk-js) (its `DOCUMENTATION.md`);
- the protocol definitions, [openfeed-org/proto](https://github.com/openfeed-org/proto).

## Contents

1. [Lifetime and connection](#1-lifetime-and-connection)
2. [Subscriptions](#2-subscriptions)
3. [State](#3-state)
4. [Raw access](#4-raw-access)
5. [Diagnostics](#5-diagnostics)
6. [Functions](#6-functions)
7. [Types](#7-types)
8. [Delivery guarantees](#8-delivery-guarantees)

## 1. Lifetime and connection

| Member | |
|---|---|
| `new DesktopSdk({ logger?, coalesceIntervalMs? })` | One SDK for the application's lifetime. `logger` is `{ log, warn, error }`, `console` for example. `coalesceIntervalMs`: see §8. |
| `login({ url, username, password })` | Connects with a new Openfeed client. Logging in while logged in logs out first. |
| `logout()` | Disconnects and clears all market state. Subscriptions stay open, and are sent again at the next login. |
| `dispose()` | Logs out, closes every subscription and removes every listener. |
| `connectionState` | `logged-out`, `connecting`, `connected`, `disconnected` or `credentials-rejected` (until the next `login` or `logout`). |
| `onConnectionState(listener)` | Called with each new connection state. |
| `whenConnected()` | Resolves once connected, waiting for a login if needed. Rejects if the credentials are rejected or the SDK is disposed first. |
| `onHeartbeat(listener)` | Called with each heartbeat as `(serverTime, raw)`: the server's time as a `Date` (`null` if it has none), and the `HeartBeat` message. |

Reconnecting and resubscribing after a lost connection are the Openfeed client's job.

## 2. Subscriptions

| Method | Listener gets | Subscription type | Default service |
|---|---|---|---|
| `subscribeQuote(symbol, listener, service?)` | `QuoteEvent` | `ALL` | `REAL_TIME` |
| `subscribeDepth(symbol, listener, service?)` | `BookEvent` | `DEPTH_PRICE` | `REAL_TIME` |
| `subscribeCumulativeVolume(symbol, listener, service?)` | `CumulativeVolumeEvent` | `CUMULATIVE_VOLUME` | `REAL_TIME_SNAPSHOT` |

Each returns a `Subscription` (§7) at once, in state `pending`.

- **Listener:** `{ onEvent?, onError?, onMessage? }`. `onEvent` gets the events; `onError` gets a `SubscriptionError` when the server refuses the subscription; `onMessage` also gets the subscription's raw messages, after `onEvent`.
- **First callback:** after `subscribe` has returned, never inside it. A new subscriber gets the current state as one `initial` event, or the stored error if the server already refused the subscription.
- **Shared subscriptions:** subscriptions with the same symbol, type and service share one Openfeed subscription, which closes with the last of them.
- **Cumulative volume** also holds the symbol's `ALL` subscription on `REAL_TIME`, the one `subscribeQuote` uses by default, so it keeps updating with the symbol's trades. If that subscription fails, the cumulative volume subscribers get its error.
- **Aliases** such as `ZC*1` follow rolls: after a roll, the new contract arrives as a `snapshot` event with the new `instrument`.
- **While logged out,** subscriptions stay `pending`, and are sent at the next login.

| Member | |
|---|---|
| `isSubscribed(symbol)` | Whether a subscription currently holds the symbol. |
| `onRemoved(listener)` | Called with a symbol when the last subscription holding it closes. |

## 3. State

The current state for a symbol, as the last event delivered it; `undefined` until the SDK has it. Everything returned is frozen.

| Method | Returns |
|---|---|
| `getInstrument(symbol)` | `Instrument` |
| `getQuote(symbol)` | `QuoteRecord` |
| `getFormattedQuote(symbol)` | `FormattedQuote` |
| `getBook(symbol)` | `Book` |
| `getCumulativeVolume(symbol)` | `PriceVolume[]`, ascending by price |

## 4. Raw access

`sdk.raw`, for what the SDK doesn't model:

| Member | |
|---|---|
| `subscribe(symbol, type, listener?, service?)` | Any Openfeed subscription, without SDK state or events. The listener (`{ onMessage, onError? }`) gets the subscription's responses and every message for the instruments they named. `service` defaults to `REAL_TIME`. Returns a `Subscription`. |
| `requestSnapshot(symbol, service?)` | One snapshot: resolves with `{ instrumentDefinition, marketSnapshot }`, then closes. `service` defaults to `REAL_TIME_SNAPSHOT`. Rejects if the subscription fails or the SDK is disposed. |
| `onMessage(listener)` | Every incoming message, with its metadata (the client's symbol names and the instrument definition), after the SDK and its subscribers have handled it. |
| `send(request, correlationId?)` | Sends an `OpenfeedRequest`. Returns the correlation id, or `undefined` when not connected. |
| `lookupInstruments(request)` | An instrument lookup: an `OpenFeedInstrumentRequest` in, `InstrumentDefinition[]` out. Waits for the connection. |

## 5. Diagnostics

`sdk.diagnostics`, for support and debugging:

| Member | |
|---|---|
| `getConnectionToken()` | The session token; `undefined` while not connected. |
| `getLastMessages(symbol)` | `{ snapshot, update }`: the instrument's last snapshot and last update. |
| `getSubscriptionInfo()` | Every Openfeed subscription the SDK holds: service, type, symbol, state, number of subscribers, error and last response. |

## 6. Functions

| Function | |
|---|---|
| `formatPrice(price, format)` | A price as a string, in a `PriceFormat` you choose, such as a fixed number of decimals or a fraction. `""` for `null`. |
| `formatDecimal(text)` | Adds thousands separators to a decimal number's text: `"1250.5"` → `"1,250.5"`. |

## 7. Types

### Events

Every event has:

| Field | |
|---|---|
| `symbol` | The symbol subscribed to; an alias stays the alias. |
| `instrument` | The `Instrument`. |
| `kind` | `initial` (the state delivered to a new subscriber), `snapshot` or `update` (a message was just applied). |
| `raw` | The `OpenfeedGatewayMessage` behind it; for `initial`, the instrument's last snapshot. |

| Event | Also has |
|---|---|
| `QuoteEvent` | `quote: QuoteRecord`, `formatted: FormattedQuote` |
| `BookEvent` | `book: Book`, the whole book |
| `CumulativeVolumeEvent` | `levels: PriceVolume[]`, every level ascending by price; `changed: PriceVolume[]`, the levels this message changed. On `initial` and `snapshot`, `changed` is every level, and levels not in it are gone. |

### `Subscription`

| Member | |
|---|---|
| `state` | `pending` until the server answers (and again after a logout), then `active` or `error`; `closed` after `close()`. |
| `error` | The `SubscriptionError` while the state is `error`. |
| `close()` | Ends the subscription. Idempotent; no callback arrives after it returns. |

`SubscriptionError` has the server's `result`, the `symbol`, the subscription `type`, and its `message`.

### `QuoteRecord`

| Group | Type | Fields |
|---|---|---|
| `session` | `SessionRecord` | The current session. |
| `previousSession` | `SessionRecord` | The previous session. |
| `bestBidOffer` | `BestBidOfferRecord` | `bidPrice`, `bidSize`, `bidOrderCount`, `askPrice`, `askSize`, `askOrderCount` |
| `status` | `StatusRecord` | `trading`, `prior` (trading status codes), `tradeDate`, `time` |

`SessionRecord`: `tradeDate`; `open`, `high`, `low`; `close` with `closeTime` and `closeTradeDate`; `settle` with `settleTime`, `settleTradeDate` and `settlePreliminary`; `prevSettle` with `prevSettleTime` and `prevSettleTradeDate`; `last` with `lastTime`, `lastTradeDate` and `lastSize`; `lastTrade`; `volume`, `openInterest`, `numberOfTrades`.

- Prices and quantities are numbers, scaled to their real values.
- `null` means the feed hasn't sent the field.
- A group is a new object only when it changed, so an unchanged group can be told by identity.
- `…Time` fields are `Date`s; `…TradeDate` fields (and `tradeDate`) are `TradeDate`s. Treat the `Date`s as read-only, like the rest of the record.

### `FormattedQuote`

The quote as strings, with a view per group: `session`, `previousSession` and `bestBidOffer`. Every view has:

| Member | |
|---|---|
| its fields | Prices in the instrument's own notation, quantities with thousands separators, `""` for `null`. |
| `decimal` | The same fields, with prices in decimal notation. |
| `values` | Every field as a plain object, for spreading: `{ ...formatted.session.values }`. |

Fields are formatted when read. `JSON.stringify(formatted)` gives every view's values.

### `Instrument`

| Member | |
|---|---|
| `marketId`, `symbol`, `description`, `instrumentType`, `exchangeCode`, `timeZoneName`, `bookDepth`, `minimumPriceIncrement` | From the instrument definition. |
| `priceFormat` | The `PriceFormat` its prices are written in. |
| `definition` | The whole `InstrumentDefinition`. |
| `price(raw)`, `quantity(raw)` | A protocol price or quantity, scaled; for values read from raw messages. |
| `formatPrice(price, notation?)` | A price as a string; `notation` is `"native"` (the default) or `"decimal"`. In 32nds, `112.5` is `"112-16"`, or `"112.50000"` in decimal. `""` for `null`. |
| `parsePrice(text)` | A price string back to a number. A fraction with a subdenominator ends in its sub-fraction's first decimal digit, as `formatPrice` writes it: in quarter 32nds, `"104-002"` is 104 and ¼ of a 32nd, so formatted prices parse back exactly. A digit `formatPrice` never writes reads as tenths. |

### Others

| Type | |
|---|---|
| `Book` | `{ bids: PriceLevel[], asks: PriceLevel[] }`, each side `bookDepth` long. A level outside it, in a snapshot or an update, is skipped and logged as an error. |
| `PriceLevel` | `{ price, size, orderCount? }`; an empty slot is `{ price: 0, size: 0 }`. |
| `PriceVolume` | `{ price, volume }` |
| `TradeDate` | A date without a time: `year`, `month` (1–12), `day`, `equals()`, `toString()` as `"YYYY-MM-DD"`. |
| `PriceFormat` | `{ priceScaling, numDecimals?, fraction?: { denominator, subdenominator } }` |
| `Credentials` | `{ url, username, password }` |
| `SdkLogger` | `{ log, warn, error }` |

## 8. Delivery guarantees

- **State first:** a callback runs after the message was applied, so the `get…` methods already return the new state inside it.
- **In order** within a subscription; no order across subscriptions.
- **Never during `subscribe`:** the first callback comes after it returned.
- **An event per message, unless coalesced:** by default, every message's events are delivered when it arrives. With `coalesceIntervalMs`, events are held for up to that many milliseconds, and each subscription then gets one event with the latest state:
    - `kind` is `snapshot` if any held message was a snapshot, otherwise `update`;
    - `raw` is the last message behind it;
    - a cumulative volume event's `changed` has every level the held messages changed.

    The state is applied per message either way, so the `get…` methods are always current. First callbacks, errors and raw messages (`onMessage`, `raw.onMessage`) aren't held, so a listener's `onMessage` can come before the `onEvent` that covers the same message. Events held at `logout` are dropped.
- **Nothing after `close()`.**
- **One failing listener doesn't stop the rest:** a listener's exception is caught and logged.

Every `on…` method returns a function that removes the listener.
