[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / RawListener

# Interface: RawListener

Gets the subscription's responses and every message for the markets those responses named.

## Methods

### onMessage()

> **onMessage**(`message`, `metadata`): `void`

Each message, with what the Openfeed client knows about it.

#### Parameters

##### message

`OpenfeedGatewayMessage`

##### metadata

[`MessageMetadata`](MessageMetadata.md)

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
