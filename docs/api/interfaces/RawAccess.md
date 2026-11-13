[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / RawAccess

# Interface: RawAccess

`sdk.raw`: protocol-level access, for what the SDK doesn't model.

## Methods

### subscribe()

> **subscribe**(`symbol`, `type`, `listener?`, `service?`): [`Subscription`](Subscription.md)

A wire subscription without SDK state or events (UDS roots, say). The listener gets the subscription's
responses and every message for the markets those responses named.

#### Parameters

##### symbol

`string`

##### type

`SubscriptionType`

##### listener?

[`RawListener`](RawListener.md)

##### service?

`Service`

#### Returns

[`Subscription`](Subscription.md)

***

### requestSnapshot()

> **requestSnapshot**(`symbol`, `service?`): `Promise`\<[`SnapshotMessage`](SnapshotMessage.md)\>

A one-off snapshot: resolves with the definition and the first snapshot, then closes. Rejects on an error.

#### Parameters

##### symbol

`string`

##### service?

`Service`

#### Returns

`Promise`\<[`SnapshotMessage`](SnapshotMessage.md)\>

***

### onMessage()

> **onMessage**(`listener`): () => `void`

Every incoming message, after the SDK applied it. Meant for the Desktop proxy, which forwards everything.

#### Parameters

##### listener

(`message`, `metadata`) => `void`

#### Returns

() => `void`

***

### send()

> **send**(`request`, `correlationId?`): `Long` \| `undefined`

Sends a request the SDK doesn't model. Returns the correlation id, or undefined when not connected.

#### Parameters

##### request

`OpenfeedRequest`

##### correlationId?

`Long`

#### Returns

`Long` \| `undefined`

***

### lookupInstruments()

> **lookupInstruments**(`request`): `Promise`\<`InstrumentDefinition`[]\>

The gateway's instrument lookup, with the protocol's request and definitions; waits for the connection.

#### Parameters

##### request

`OpenFeedInstrumentRequest`

#### Returns

`Promise`\<`InstrumentDefinition`[]\>
