[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / TradeDate

# Class: TradeDate

A trading session's date, as the exchange counts it. It has no time and no time zone, so it isn't a `Date`: a
session that starts on Sunday evening can trade on Monday's date.

## Properties

### year

> `readonly` **year**: `number`

The year, such as 2026.

***

### month

> `readonly` **month**: `number`

The month, 1 to 12.

***

### day

> `readonly` **day**: `number`

The day of the month, 1 to 31.

## Methods

### fromProto()

> `static` **fromProto**(`yyyymmdd`): `TradeDate` \| `null`

Reads a date in Openfeed's `tradeDate` form.

#### Parameters

##### yyyymmdd

`number` \| `undefined`

The date as a number, such as `20261112`; 0 and `undefined` mean "not set".

#### Returns

`TradeDate` \| `null`

The date, or `null` when it isn't set.

***

### equals()

> **equals**(`other`): `boolean`

Whether two dates are the same day.

#### Parameters

##### other

`TradeDate` \| `null`

The date to compare with; `null` is never equal.

#### Returns

`boolean`

***

### toString()

> **toString**(): `string`

The date as `YYYY-MM-DD`, such as `2026-11-12`.

#### Returns

`string`
