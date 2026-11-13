[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / SubscriptionError

# Class: SubscriptionError

A subscription the server refused. `message` says what was refused and ends with the server's own text, which is
kept as it came in `serverMessage`. The message is for reading; code should decide on `result`, Openfeed's
`Result` value.

## Example

```ts
error.message; // 'INSUFFICIENT_PRIVILEGES: DEPTH_PRICE on ESZ26 (REAL_TIME) was refused. Server said: "…"'
```

## Extends

- `Error`

## Constructors

### Constructor

> **new SubscriptionError**(`result`, `symbol`, `type`, `service`, `serverMessage`, `requiredBy?`): `SubscriptionError`

Created by the SDK, which passes it to `onError`; an application has no need to create one.

#### Parameters

##### result

`Result`

Openfeed's result code for the refusal. Decide on this, not on the message's text.

##### symbol

`string`

The symbol the subscription asked for.

##### type

`SubscriptionType`

The subscription the server refused.

##### service

`Service`

The service that subscription asked for.

##### serverMessage

`string`

The server's own text, as it came; empty if it sent none.

##### requiredBy?

`SubscriptionType`

Set when the refused subscription is one that the subscriber's own type depends on: on a cumulative volume
subscriber's error, `CUMULATIVE_VOLUME`, with `type` being the `ALL` it holds. Otherwise `undefined`.

#### Returns

`SubscriptionError`

#### Overrides

`Error.constructor`

## Properties

### result

> `readonly` **result**: `Result`

Openfeed's result code for the refusal. Decide on this, not on the message's text.

***

### symbol

> `readonly` **symbol**: `string`

The symbol the subscription asked for.

***

### type

> `readonly` **type**: `SubscriptionType`

The subscription the server refused.

***

### service

> `readonly` **service**: `Service`

The service that subscription asked for.

***

### serverMessage

> `readonly` **serverMessage**: `string`

The server's own text, as it came; empty if it sent none.

***

### requiredBy?

> `readonly` `optional` **requiredBy?**: `SubscriptionType`

Set when the refused subscription is one that the subscriber's own type depends on: on a cumulative volume
subscriber's error, `CUMULATIVE_VOLUME`, with `type` being the `ALL` it holds. Otherwise `undefined`.

***

### cause?

> `optional` **cause?**: `unknown`

#### Inherited from

`Error.cause`

***

### name

> **name**: `string`

#### Inherited from

`Error.name`

***

### message

> **message**: `string`

#### Inherited from

`Error.message`

***

### stack?

> `optional` **stack?**: `string`

#### Inherited from

`Error.stack`
