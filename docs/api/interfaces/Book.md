[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / Book

# Interface: Book

An order book by price level. Both sides always have the instrument's `bookDepth` levels, best price first; empty
levels are `{ price: 0, size: 0 }`.

## Properties

### bids

> `readonly` **bids**: [`PriceLevel`](PriceLevel.md)[]

The buy side, highest price first.

***

### asks

> `readonly` **asks**: [`PriceLevel`](PriceLevel.md)[]

The sell side, lowest price first.
