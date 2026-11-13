[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / Instrument

# Interface: Instrument

An instrument, from its Openfeed definition: what it is, where it trades, and how its prices are read and written.
Every event carries one, and `sdk.getInstrument` returns it.

## Properties

### marketId

> `readonly` **marketId**: `string`

Openfeed's id for the market, as a string.

***

### symbol

> `readonly` **symbol**: `string`

The symbol it was subscribed with, as the event's `symbol`, or the one passed to `sdk.getInstrument`: for
`ES*1`, it's `ES*1`. The definition's own symbol, which can be the exchange's (`ESZ6`), is `definition.symbol`.

***

### description

> `readonly` **description**: `string`

A human-readable description of the market.

***

### instrumentType

> `readonly` **instrumentType**: `InstrumentDefinition_InstrumentType`

What kind of instrument it is, such as a future, an option or an equity.

***

### exchangeCode

> `readonly` **exchangeCode**: `string`

The exchange's ISO 10383 market identifier code (MIC).

***

### timeZoneName

> `readonly` **timeZoneName**: `string`

The exchange's time zone, as a tz database name such as `America/Chicago`.

***

### bookDepth

> `readonly` **bookDepth**: `number`

How many price levels each side of the order book has.

***

### minimumPriceIncrement

> `readonly` **minimumPriceIncrement**: `number`

The smallest price change, in the market's currency.

***

### priceFormat

> `readonly` **priceFormat**: [`PriceFormat`](PriceFormat.md)

How the instrument's prices are written, which `formatPrice` and `parsePrice` use.

***

### definition

> `readonly` **definition**: `InstrumentDefinition`

The Openfeed definition everything else here comes from, with the fields the SDK doesn't model.

## Methods

### price()

#### Call Signature

> **price**(`raw`): `number`

Converts a price from an Openfeed message to a number; `null` when the message has none.

##### Parameters

###### raw

`Long`

##### Returns

`number`

#### Call Signature

> **price**(`raw`): `number` \| `null`

Converts a price from an Openfeed message to a number; `null` when the message has none.

##### Parameters

###### raw

`Long` \| `undefined`

##### Returns

`number` \| `null`

***

### quantity()

#### Call Signature

> **quantity**(`raw`): `number`

Converts a quantity from an Openfeed message to a number; `null` when the message has none.

##### Parameters

###### raw

`Long`

##### Returns

`number`

#### Call Signature

> **quantity**(`raw`): `number` \| `null`

Converts a quantity from an Openfeed message to a number; `null` when the message has none.

##### Parameters

###### raw

`Long` \| `undefined`

##### Returns

`number` \| `null`

***

### formatPrice()

> **formatPrice**(`price`, `notation?`): `string`

Formats a price in the instrument's own format.

#### Parameters

##### price

`number` \| `null` \| `undefined`

The price; `null` and `undefined` give `""`.

##### notation?

[`PriceNotation`](../type-aliases/PriceNotation.md)

`native` (the default) for the instrument's own notation, such as `"112-16"`, or `decimal` for
`"112.50000"`.

#### Returns

`string`

The formatted price.

***

### parsePrice()

> **parsePrice**(`text`): `number` \| `undefined`

Reads a price written in the instrument's own format, the reverse of `formatPrice`. Commas as thousands separators
are allowed.

A fraction with a subdenominator ends in one digit for the part of the unit, as `formatPrice` writes it: in
quarter 32nds, `"104-002"` is 104 and ¼ of a 32nd. So formatted prices parse back exactly. A last digit
`formatPrice` never writes reads as tenths.

#### Parameters

##### text

`string`

The price as text, such as `"112-16"` or `"1,234.50"`.

#### Returns

`number` \| `undefined`

The price; `undefined` for empty text, and `NaN` for text that isn't a price.
