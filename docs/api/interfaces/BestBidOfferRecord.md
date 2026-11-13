[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / BestBidOfferRecord

# Interface: BestBidOfferRecord

The best bid and offer: the highest price a buyer is offering and the lowest a seller will take. When one side is
empty, an update sets its fields to 0.

## Properties

### bidPrice

> `readonly` **bidPrice**: `number` \| `null`

The highest bid.

***

### bidSize

> `readonly` **bidSize**: `number` \| `null`

The quantity bid at `bidPrice`.

***

### bidOrderCount

> `readonly` **bidOrderCount**: `number` \| `null`

How many orders make up `bidSize`, when the feed sends it.

***

### askPrice

> `readonly` **askPrice**: `number` \| `null`

The lowest offer.

***

### askSize

> `readonly` **askSize**: `number` \| `null`

The quantity offered at `askPrice`.

***

### askOrderCount

> `readonly` **askOrderCount**: `number` \| `null`

How many orders make up `askSize`, when the feed sends it.
