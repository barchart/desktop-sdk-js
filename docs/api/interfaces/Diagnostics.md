[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / Diagnostics

# Interface: Diagnostics

`sdk.diagnostics`: what support and debugging need, not trading.

## Methods

### getConnectionToken()

> **getConnectionToken**(): `string` \| `undefined`

The gateway's session token; undefined while not connected.

#### Returns

`string` \| `undefined`

***

### getLastMessages()

> **getLastMessages**(`symbol`): [`LastMessages`](LastMessages.md) \| `undefined`

The market's last snapshot and last applied update.

#### Parameters

##### symbol

`string`

#### Returns

[`LastMessages`](LastMessages.md) \| `undefined`

***

### getSubscriptionInfo()

> **getSubscriptionInfo**(): [`SubscriptionInfo`](SubscriptionInfo.md)[]

Every subscription entry: its key, state, subscriber count, error and last response.

#### Returns

[`SubscriptionInfo`](SubscriptionInfo.md)[]
