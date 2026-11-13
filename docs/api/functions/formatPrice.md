[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / formatPrice

# Function: formatPrice()

> **formatPrice**(`price`, `format`): `string`

Formats a price in a format you choose. To format in an instrument's own format, use its `formatPrice` instead.

## Parameters

### price

`number` \| `null` \| `undefined`

The price. `null` and `undefined` give `""`.

### format

[`PriceFormat`](../interfaces/PriceFormat.md)

A fixed number of decimals (`numDecimals`, with thousands separators) or a fraction (`fraction`,
as in "112-16" for 112 and 16/32). With neither, the number as is.

## Returns

`string`

The formatted price.

## Example

```ts
formatPrice(1234.5, { numDecimals: 2, priceScaling: 1 }); // "1,234.50"
formatPrice(112.5, { fraction: { denominator: 32, subdenominator: 1 }, priceScaling: 1 }); // "112-16"
formatPrice(112.515625, { fraction: { denominator: 32, subdenominator: 2 }, priceScaling: 1 }); // "112-165"
formatPrice(null, { numDecimals: 2, priceScaling: 1 }); // ""
```
