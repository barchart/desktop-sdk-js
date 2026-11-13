[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / Subscription

# Interface: Subscription

What a subscribe method returns. Closing it is the only way to give up the subscription.
After `subscribe` returns, the listener gets the current state as one `initial` event (or a stored error through
`onError`); events report changes from then on.

## Properties

### state

> `readonly` **state**: [`SubscriptionState`](../type-aliases/SubscriptionState.md)

Where the subscription stands: `pending` until the server answers, then `active` or `error`; `closed` once
closed.

***

### error

> `readonly` **error**: [`SubscriptionError`](../classes/SubscriptionError.md) \| `undefined`

The server's refusal, if the subscription is in `error` (also one stored from an earlier subscriber).

## Methods

### close()

> **close**(): `void`

Idempotent; no callbacks arrive after it returns.

#### Returns

`void`
