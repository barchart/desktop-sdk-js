[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / DesktopSdk

# Class: DesktopSdk

Live quotes, order books and cumulative volume from Openfeed, kept up to date.

Create one for the application's lifetime and log in and out of it as needed. Subscriptions stay open across
logins: one made while logged out waits, and every login sends them all again. Logging out clears market state.

## Example

```ts
const sdk = new DesktopSdk({ logger: console });
sdk.login({ url: "ws://localhost:9000", username: "your-username", password: "your-password" });

const subscription = sdk.subscribeQuote("ESZ26", {
    onEvent({ kind, instrument, formatted }) {
        console.log(kind, instrument.symbol, formatted.session.last);
    },
});

// later
subscription.close();
sdk.dispose();
```

## Constructors

### Constructor

> **new DesktopSdk**(`options?`): `DesktopSdk`

Creates the SDK, logged out. Nothing connects until [DesktopSdk.login](#login).

#### Parameters

##### options?

[`DesktopSdkOptions`](../interfaces/DesktopSdkOptions.md) = `{}`

The logger (`console` by default) and event coalescing (off by default).

#### Returns

`DesktopSdk`

## Properties

### raw

> `readonly` **raw**: [`RawAccess`](../interfaces/RawAccess.md)

Protocol-level access: raw subscriptions, snapshots, messages and requests.

***

### diagnostics

> `readonly` **diagnostics**: [`Diagnostics`](../interfaces/Diagnostics.md)

What support and debugging need.

## Accessors

### connectionState

#### Get Signature

> **get** **connectionState**(): [`ConnectionState`](../type-aliases/ConnectionState.md)

The connection's current state. [DesktopSdk.onConnectionState](#onconnectionstate) reports each change.

##### Returns

[`ConnectionState`](../type-aliases/ConnectionState.md)

## Methods

### login()

> **login**(`credentials`): `void`

Connects to the Openfeed server, and sends every open subscription once connected. Logging in while logged in
logs out first. Returns at once: follow the connection with [DesktopSdk.onConnectionState](#onconnectionstate) or wait for it
with [DesktopSdk.whenConnected](#whenconnected).

#### Parameters

##### credentials

[`Credentials`](../interfaces/Credentials.md)

The server's URL, and the username and password to log in with.

#### Returns

`void`

#### Throws

Error if the SDK has been disposed.

***

### logout()

> **logout**(): `void`

Disconnects and clears all market state. Subscriptions stay open, as `pending`, and are sent again at the next
login. Does nothing when logged out.

#### Returns

`void`

***

### dispose()

> **dispose**(): `void`

Logs out, closes every subscription and removes every listener. Pending [DesktopSdk.whenConnected](#whenconnected) and
`raw.requestSnapshot` calls reject. The SDK can't be used afterwards. Calling it again does nothing.

#### Returns

`void`

***

### onConnectionState()

> **onConnectionState**(`listener`): () => `void`

Listens for connection state changes.

#### Parameters

##### listener

(`state`) => `void`

Called with each new state.

#### Returns

A function that removes the listener.

() => `void`

***

### onHeartbeat()

> **onHeartbeat**(`listener`): () => `void`

Listens for the server's heartbeats.

#### Parameters

##### listener

[`HeartbeatListener`](../type-aliases/HeartbeatListener.md)

Called with each heartbeat's server time (`null` if it has none) and the `HeartBeat` message.

#### Returns

A function that removes the listener.

() => `void`

***

### onRemoved()

> **onRemoved**(`listener`): () => `void`

Listens for symbols that are no longer subscribed (see [DesktopSdk.isSubscribed](#issubscribed)), because the last
subscription holding them closed. A logout isn't reported here: it clears everything and reports `logged-out`
through [DesktopSdk.onConnectionState](#onconnectionstate).

#### Parameters

##### listener

(`symbol`) => `void`

Called with each removed symbol.

#### Returns

A function that removes the listener.

() => `void`

***

### isSubscribed()

> **isSubscribed**(`symbol`): `boolean`

Whether a subscription currently holds the symbol's instrument, including a raw subscription whose responses
named it, such as a root subscription (`ZC^UDS`) with its instruments. The `get…` methods answer only while this
is `true`.

#### Parameters

##### symbol

`string`

A subscribed symbol (an alias included), or the definition symbol of an instrument a
subscription holds.

#### Returns

`boolean`

***

### whenConnected()

> **whenConnected**(): `Promise`\<`void`\>

Waits for the connection, through a login if there hasn't been one yet.

#### Returns

`Promise`\<`void`\>

A promise that resolves once connected, at once if already connected. It rejects if the server rejects
the credentials or the SDK is disposed first.

***

### subscribeQuote()

> **subscribeQuote**(`symbol`, `listener`, `service?`): [`Subscription`](../interfaces/Subscription.md)

Subscribes to a symbol's quote: last trade, session prices and volume, best bid and offer, and trading status.

The first callback comes after this returns, never inside it: an `initial` event with the state the SDK already
has, or the stored error if the server already refused the subscription. Subscriptions with the same symbol and
service share one Openfeed subscription.

#### Parameters

##### symbol

`string`

The symbol, or an alias such as `ZC*1`, which follows rolls.

##### listener

[`Listener`](../interfaces/Listener.md)\<[`QuoteEvent`](../interfaces/QuoteEvent.md)\>

Gets each [QuoteEvent](../interfaces/QuoteEvent.md), and the server's refusal if there is one.

##### service?

`Service` = `Service.REAL_TIME`

The Openfeed service, `REAL_TIME` by default.

#### Returns

[`Subscription`](../interfaces/Subscription.md)

The subscription, `pending` until the server answers. Close it to unsubscribe.

#### Throws

Error if the SDK has been disposed.

#### Example

```ts
const subscription = sdk.subscribeQuote("ESZ26", {
    onEvent({ kind, formatted }) {
        console.log(kind, formatted.session.last, formatted.bestBidOffer.bidPrice, formatted.bestBidOffer.askPrice);
    },
    onError(error) {
        console.error(error.message);
    },
});
```

***

### subscribeDepth()

> **subscribeDepth**(`symbol`, `listener`, `service?`): [`Subscription`](../interfaces/Subscription.md)

Subscribes to a symbol's order book, by price level.

The first callback comes after this returns, never inside it: an `initial` event with the state the SDK already
has, or the stored error if the server already refused the subscription. Subscriptions with the same symbol and
service share one Openfeed subscription.

#### Parameters

##### symbol

`string`

The symbol, or an alias such as `ZC*1`, which follows rolls.

##### listener

[`Listener`](../interfaces/Listener.md)\<[`BookEvent`](../interfaces/BookEvent.md)\>

Gets each [BookEvent](../interfaces/BookEvent.md), and the server's refusal if there is one.

##### service?

`Service` = `Service.REAL_TIME`

The Openfeed service, `REAL_TIME` by default.

#### Returns

[`Subscription`](../interfaces/Subscription.md)

The subscription, `pending` until the server answers. Close it to unsubscribe.

#### Throws

Error if the SDK has been disposed.

#### Example

```ts
const subscription = sdk.subscribeDepth("ESZ26", {
    onEvent({ book }) {
        console.log("best bid", book.bids[0]?.price, "best ask", book.asks[0]?.price);
    },
});
```

***

### subscribeCumulativeVolume()

> **subscribeCumulativeVolume**(`symbol`, `listener`, `service?`): [`Subscription`](../interfaces/Subscription.md)

Subscribes to a symbol's cumulative volume: the volume traded at each price.

It also holds the symbol's quote subscription on `REAL_TIME`, whose trades keep the volume up to date; if that
one is refused, this subscription's listeners get its error, with `requiredBy` set. Not every Openfeed server
sends volume at price: on one that doesn't, the subscription goes `active` but no events come.

The first callback comes after this returns, never inside it, as for [DesktopSdk.subscribeQuote](#subscribequote).

#### Parameters

##### symbol

`string`

The symbol, or an alias such as `ZC*1`, which follows rolls.

##### listener

[`Listener`](../interfaces/Listener.md)\<[`CumulativeVolumeEvent`](../interfaces/CumulativeVolumeEvent.md)\>

Gets each [CumulativeVolumeEvent](../interfaces/CumulativeVolumeEvent.md), and the server's refusal if there is one.

##### service?

`Service` = `Service.REAL_TIME_SNAPSHOT`

The Openfeed service, `REAL_TIME_SNAPSHOT` by default.

#### Returns

[`Subscription`](../interfaces/Subscription.md)

The subscription, `pending` until the server answers. Close it to unsubscribe.

#### Throws

Error if the SDK has been disposed.

#### Example

```ts
const subscription = sdk.subscribeCumulativeVolume("ESZ26", {
    onEvent({ changed }) {
        for (const { price, volume } of changed) {
            console.log(price, volume);
        }
    },
});
```

***

### getInstrument()

> **getInstrument**(`symbol`): [`Instrument`](../interfaces/Instrument.md) \| `undefined`

The instrument's definition: its description, exchange, price format and more. Its `symbol` is the one passed
here, so `getInstrument("ES*1").symbol` is `ES*1`; the contract's own is `definition.symbol`.

#### Parameters

##### symbol

`string`

A subscribed symbol (an alias included), or the definition symbol of an instrument a
subscription holds.

#### Returns

[`Instrument`](../interfaces/Instrument.md) \| `undefined`

The instrument, frozen; `undefined` until the SDK has its definition, or when no subscription holds it.

***

### getQuote()

> **getQuote**(`symbol`): [`QuoteRecord`](../interfaces/QuoteRecord.md) \| `undefined`

The current quote, as the last quote event delivered it. For the same values as strings, use
[DesktopSdk.getFormattedQuote](#getformattedquote).

#### Parameters

##### symbol

`string`

A subscribed symbol (an alias included), or the definition symbol of an instrument a
subscription holds.

#### Returns

[`QuoteRecord`](../interfaces/QuoteRecord.md) \| `undefined`

The quote, frozen; `undefined` until the SDK has one, or when no subscription holds it.

***

### getFormattedQuote()

> **getFormattedQuote**(`symbol`): [`FormattedQuote`](../interfaces/FormattedQuote.md) \| `undefined`

The current quote as strings in the instrument's price format, as a quote event's `formatted` carries them.

#### Parameters

##### symbol

`string`

A subscribed symbol (an alias included), or the definition symbol of an instrument a
subscription holds.

#### Returns

[`FormattedQuote`](../interfaces/FormattedQuote.md) \| `undefined`

The formatted quote; `undefined` until the SDK has a quote, or when no subscription holds it.

***

### getBook()

> **getBook**(`symbol`): [`Book`](../interfaces/Book.md) \| `undefined`

The current order book, as the last book event delivered it. Each side has the instrument's `bookDepth` levels,
best price first; an empty level has price and size 0.

#### Parameters

##### symbol

`string`

A subscribed symbol (an alias included), or the definition symbol of an instrument a
subscription holds.

#### Returns

[`Book`](../interfaces/Book.md) \| `undefined`

The book, frozen; `undefined` until the SDK has one, or when no subscription holds it.

***

### getCumulativeVolume()

> **getCumulativeVolume**(`symbol`): readonly [`PriceVolume`](../interfaces/PriceVolume.md)[] \| `undefined`

The volume traded at each price, as the last cumulative volume event delivered it.

#### Parameters

##### symbol

`string`

A subscribed symbol (an alias included), or the definition symbol of an instrument a
subscription holds.

#### Returns

readonly [`PriceVolume`](../interfaces/PriceVolume.md)[] \| `undefined`

The levels, ascending by price and frozen; `undefined` until a snapshot brings volume at price, or when no
subscription holds it.
