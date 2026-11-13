[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / SubscriptionInfo

# Interface: SubscriptionInfo

One Openfeed subscription the SDK holds, for diagnostics. Subscribers with the same symbol, type and service share
one.

## Properties

### service

> `readonly` **service**: `Service`

The Openfeed service it was made on.

***

### type

> `readonly` **type**: `SubscriptionType`

The Openfeed subscription type, such as `ALL` for quotes.

***

### symbol

> `readonly` **symbol**: `string`

The symbol as subscribed.

***

### state

> `readonly` **state**: `"pending"` \| `"active"` \| `"error"`

Where it stands: `pending`, `active` or `error`.

***

### subscribers

> `readonly` **subscribers**: `number`

How many subscriptions share it.

***

### error

> `readonly` **error**: [`SubscriptionError`](../classes/SubscriptionError.md) \| `undefined`

The server's refusal, while in `error`.

***

### response

> `readonly` **response**: `SubscriptionResponse` \| `undefined`

The server's last answer; `undefined` until it answers.
