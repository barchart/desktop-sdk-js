[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / PriceFormat

# Interface: PriceFormat

How an instrument's prices are written: a fixed number of decimals, or a fraction such as 32nds. An instrument's
comes from its definition (`instrument.priceFormat`); [formatPrice](../functions/formatPrice.md) takes one you choose.

## Properties

### numDecimals?

> `optional` **numDecimals?**: `number`

Decimal notation with this many decimals. Takes precedence over `fraction`.

***

### priceScaling

> **priceScaling**: `number`

What the instrument's prices are multiplied by when the SDK reads them from the feed. Formatting doesn't use it:
the prices it formats are already scaled.

***

### fraction?

> `optional` **fraction?**: `object`

Fractional notation, `112-16` for 112 and 16/32.

#### denominator

> **denominator**: `number`

The fraction's unit: 32 for 32nds.

#### subdenominator

> **subdenominator**: `number`

Parts of each unit, written as one more digit: 2 for half 32nds, so 112 and 16.5/32 is `112-165`. 1 for
none.
