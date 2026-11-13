# Reference

The SDK's public methods, how they behave, and the delivery guarantees. The [API reference](api/README.md), generated from the code, has every type, field and parameter in detail. The [README](../README.md) is the introduction, and the [design](design.md) explains how the SDK works inside.

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
- **Cumulative volume** also holds the symbol's `ALL` subscription on `REAL_TIME`, the one `subscribeQuote` uses by default, so it keeps updating with the symbol's trades. If that subscription fails, the cumulative volume subscribers get its error, with `requiredBy` set. Not every Openfeed server sends volume at price: on one that doesn't, the subscription goes `active`, but no events come and `getCumulativeVolume` stays `undefined`.
- **Aliases** such as `ZC*1` follow rolls: after a roll, the new contract arrives as a `snapshot` event with the new `instrument`.
- **While logged out,** subscriptions stay `pending`, and are sent at the next login.

| Member | |
|---|---|
| `isSubscribed(symbol)` | Whether a subscription currently holds the symbol. |
| `onRemoved(listener)` | Called with a symbol when the last subscription holding it closes. |

## 3. State

The current state for a symbol, as the last event delivered it; `undefined` until the SDK has it. Everything returned is frozen. The symbol is one you subscribed to, an alias included, or the definition symbol of an instrument a root subscription (`ZC^UDS`) brought in, while it's open.

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
| `send(request, correlationId?)` | Sends an `OpenfeedRequest`. Returns the correlation id, or `undefined` when not connected. Responses arrive through `onMessage`; the SDK keeps no state for what it brings. |
| `lookupInstruments(request)` | An instrument lookup: an `OpenFeedInstrumentRequest` in, `InstrumentDefinition[]` out. Waits for the connection. The request is sent as given, so it needs its `instrumentType` and `spreadType` lists, empty when unused. Rejects with an `InstrumentLookupError` (from `@openfeed/sdk-js`, with the server's `result` and `serverMessage`) if the server refuses it or finds nothing, and with an error if the connection drops first. |

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

Every type, with each field and method, is in the [API reference](api/README.md), generated from the code. The rules that hold across them:

- **Events** all have `symbol` (as subscribed; an alias stays the alias), `instrument` (whose `symbol` is that same name; the contract's own is `instrument.definition.symbol`), `kind` (`initial`, `snapshot` or `update`) and `raw`, the message behind the event. `QuoteEvent` adds `quote` and `formatted`, `BookEvent` adds `book`, and `CumulativeVolumeEvent` adds `levels` and `changed`.
- **Prices and quantities** are numbers, scaled to their real values. `null` means the feed hasn't sent the field.
- **Everything returned is frozen.** A quote's group (`session`, `previousSession`, `bestBidOffer`, `status`) is a new object only when a message changed it, so an unchanged group can be told by identity. `…Time` fields are `Date`s, whose setters work even when frozen: treat them as read-only too.
- **Dates:** `…Time` fields are when something happened, as a `Date`; `…TradeDate` fields and `tradeDate` are the session it belongs to, as a `TradeDate`, which has no time or time zone.
- **Formatted quotes** have a view per group, with the record's field names as strings: prices in the instrument's own notation, quantities with thousands separators, `""` for `null`. Each view's `decimal` has prices in decimal notation, and `values` has every field as a plain object. Fields are formatted when read.
- **Order books** have `bookDepth` levels per side, best price first; an empty level is `{ price: 0, size: 0 }`. A level outside the book, in a snapshot or an update, is skipped and logged as an error.

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
