[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / formatDecimal

# Function: formatDecimal()

> **formatDecimal**(`value`, `thousandsSeparator?`, `decimalSeparator?`): `string`

Adds thousands separators to a decimal number's text.

## Parameters

### value

`string`

The number as text, such as `price.toFixed(2)`.

### thousandsSeparator?

`string` = `","`

The separator to add, `","` by default.

### decimalSeparator?

`string` = `"."`

The decimal separator `value` uses, `"."` by default. It's kept as is.

## Returns

`string`

The text with separators: `"1250.5"` becomes `"1,250.5"`.

## Example

```ts
formatDecimal("1234567.25"); // "1,234,567.25"
formatDecimal("1234567,25", ".", ","); // "1.234.567,25"
```
