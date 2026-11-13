[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / BookEvent

# Interface: BookEvent

What `subscribeDepth`'s listener gets.

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

The instrument the symbol stands for; after an alias rolls, the new contract.

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

### book

> `readonly` **book**: [`Book`](Book.md)

The whole book, the same object as getBook.
