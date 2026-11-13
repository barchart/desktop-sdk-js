[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / QuoteEvent

# Interface: QuoteEvent

What `subscribeQuote`'s listener gets: the quote as numbers and as strings.

## Extends

- `EventBase`

## Properties

### symbol

> `readonly` **symbol**: `string`

The symbol as subscribed, an alias such as `ZC*1` included.

#### Inherited from

`EventBase.symbol`

***

### instrument

> `readonly` **instrument**: [`Instrument`](Instrument.md)

The instrument the symbol stands for, with `symbol` set to it; after an alias rolls, the new contract.

#### Inherited from

`EventBase.instrument`

***

### kind

> `readonly` **kind**: [`EventKind`](../type-aliases/EventKind.md)

Why the event came: the current state for a new subscriber, or a message just applied.

#### Inherited from

`EventBase.kind`

***

### raw

> `readonly` **raw**: `OpenfeedGatewayMessage`

The message behind the event: the one just applied, or for `initial` the instrument's last snapshot.

#### Inherited from

`EventBase.raw`

***

### quote

> `readonly` **quote**: [`QuoteRecord`](QuoteRecord.md)

The whole quote, the same object as getQuote.

***

### formatted

> `readonly` **formatted**: [`FormattedQuote`](FormattedQuote.md)

The same quote as strings, formatted when read: `formatted.session.last` → "112-16",
`formatted.session.decimal.last` → "112.50000".
