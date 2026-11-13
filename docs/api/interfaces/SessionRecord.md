[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / SessionRecord

# Interface: SessionRecord

One trading session, as Openfeed sends it: prices and quantities as numbers, with no fallbacks between fields. A
field the feed hasn't sent is `null`; some are never sent for a session, such as the previous session's `close`.

Prices with a time have two stamps: `…Time`, when it happened, as a `Date`; and `…TradeDate`, the session it
belongs to, as a [TradeDate](../classes/TradeDate.md). Which one to show is up to the application.

## Properties

### tradeDate

> `readonly` **tradeDate**: [`TradeDate`](../classes/TradeDate.md) \| `null`

The session's date.

***

### open

> `readonly` **open**: `number` \| `null`

The session's opening price.

***

### high

> `readonly` **high**: `number` \| `null`

The session's highest price so far.

***

### low

> `readonly` **low**: `number` \| `null`

The session's lowest price so far.

***

### close

> `readonly` **close**: `number` \| `null`

The session's closing price.

***

### closeTime

> `readonly` **closeTime**: `Date` \| `null`

When the close was set.

***

### closeTradeDate

> `readonly` **closeTradeDate**: [`TradeDate`](../classes/TradeDate.md) \| `null`

The session the close belongs to.

***

### settle

> `readonly` **settle**: `number` \| `null`

The session's settlement price.

***

### settleTime

> `readonly` **settleTime**: `Date` \| `null`

When the settlement was set.

***

### settleTradeDate

> `readonly` **settleTradeDate**: [`TradeDate`](../classes/TradeDate.md) \| `null`

The session the settlement belongs to.

***

### settlePreliminary

> `readonly` **settlePreliminary**: `boolean` \| `null`

Whether the settlement is preliminary, rather than final.

***

### prevSettle

> `readonly` **prevSettle**: `number` \| `null`

The previous session's settlement price, as the last snapshot sent it with this session. Updates change
`previousSession.settle` instead, so read that one for the latest value.

***

### prevSettleTime

> `readonly` **prevSettleTime**: `Date` \| `null`

When the previous session's settlement was set.

***

### prevSettleTradeDate

> `readonly` **prevSettleTradeDate**: [`TradeDate`](../classes/TradeDate.md) \| `null`

The session the previous settlement belongs to.

***

### last

> `readonly` **last**: `number` \| `null`

The last price.

***

### lastTime

> `readonly` **lastTime**: `Date` \| `null`

When the last price was set.

***

### lastTradeDate

> `readonly` **lastTradeDate**: [`TradeDate`](../classes/TradeDate.md) \| `null`

The session the last price belongs to.

***

### lastSize

> `readonly` **lastSize**: `number` \| `null`

The quantity traded at the last price.

***

### lastTrade

> `readonly` **lastTrade**: `number` \| `null`

The price of Openfeed's `lastTrade`, which has no time or date of its own here.

***

### volume

> `readonly` **volume**: `number` \| `null`

The quantity traded in the session so far.

***

### openInterest

> `readonly` **openInterest**: `number` \| `null`

The number of open contracts.

***

### numberOfTrades

> `readonly` **numberOfTrades**: `number` \| `null`

How many trades the session has had so far.
