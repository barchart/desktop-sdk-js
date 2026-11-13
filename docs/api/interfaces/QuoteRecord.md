[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / QuoteRecord

# Interface: QuoteRecord

A market's quote state, in the protocol's groups: the current and previous sessions, the best bid and offer, and the
trading status. A group object is replaced only when a message changed it, so an unchanged group is the same object
as before.

## Properties

### session

> `readonly` **session**: [`SessionRecord`](SessionRecord.md)

The current session.

***

### previousSession

> `readonly` **previousSession**: [`SessionRecord`](SessionRecord.md)

The session before it; every field `null` until the feed sends it.

***

### bestBidOffer

> `readonly` **bestBidOffer**: [`BestBidOfferRecord`](BestBidOfferRecord.md)

The best bid and offer.

***

### status

> `readonly` **status**: [`StatusRecord`](StatusRecord.md)

The trading status.
