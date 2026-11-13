[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / Listener

# Interface: Listener\<E\>

What a subscribe method calls. Every callback is optional. None is called inside `subscribe`, and none after the
subscription's `close()` returns.

## Type Parameters

### E

`E`

The subscription's event: [QuoteEvent](QuoteEvent.md), [BookEvent](BookEvent.md) or [CumulativeVolumeEvent](CumulativeVolumeEvent.md).

## Methods

### onEvent()?

> `optional` **onEvent**(`event`): `void`

Each event: the current state once (`initial`), then every change. Leave it out to only hold the subscription,
or to only use `onMessage`.

#### Parameters

##### event

`E`

#### Returns

`void`

***

### onError()?

> `optional` **onError**(`error`): `void`

The server refused the subscription; the subscription is then in `error`.

#### Parameters

##### error

[`SubscriptionError`](../classes/SubscriptionError.md)

#### Returns

`void`

***

### onMessage()?

> `optional` **onMessage**(`message`, `metadata`): `void`

Optional: also every raw message for the subscription's instrument, as a raw subscription gets it (responses,
and every message for the instruments its responses named), after the SDK applied it and after `onEvent`.
For a consumer that needs the state and the raw stream from one subscription, such as a chart.

#### Parameters

##### message

`OpenfeedGatewayMessage`

##### metadata

[`MessageMetadata`](MessageMetadata.md)

#### Returns

`void`
