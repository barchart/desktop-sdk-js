[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / PriceLevel

# Interface: PriceLevel

One level of an order book. An empty level has price and size 0.

## Properties

### price

> `readonly` **price**: `number`

The level's price.

***

### size

> `readonly` **size**: `number`

The quantity at this price.

***

### orderCount?

> `readonly` `optional` **orderCount?**: `number`

How many orders make up `size`, when the feed sends it.
