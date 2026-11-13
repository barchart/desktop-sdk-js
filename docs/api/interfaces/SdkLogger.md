[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / SdkLogger

# Interface: SdkLogger

Where the SDK and the Openfeed client log. `console` is one.

## Methods

### log()

> **log**(...`data`): `void`

Routine messages, such as the subscriptions sent at login.

#### Parameters

##### data

...`unknown`[]

#### Returns

`void`

***

### warn()

> **warn**(...`data`): `void`

Something unexpected that the SDK handled, such as an unknown price format.

#### Parameters

##### data

...`unknown`[]

#### Returns

`void`

***

### error()

> **error**(...`data`): `void`

A failure, such as a message the SDK couldn't apply.

#### Parameters

##### data

...`unknown`[]

#### Returns

`void`
