[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / StatusRecord

# Interface: StatusRecord

The instrument's trading status, as Openfeed's `InstrumentStatus` sends it.

## Properties

### trading

> `readonly` **trading**: `InstrumentTradingStatus` \| `null`

The current status, such as open or halted.

***

### prior

> `readonly` **prior**: `InstrumentTradingStatus` \| `null`

The status before it.

***

### tradeDate

> `readonly` **tradeDate**: [`TradeDate`](../classes/TradeDate.md) \| `null`

The status's session date; a snapshot without a status gives its own trade date.

***

### time

> `readonly` **time**: `Date` \| `null`

When the status changed (status updates only).
