[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / CumulativeVolumeEvent

# Interface: CumulativeVolumeEvent

What `subscribeCumulativeVolume`'s listener gets: every level, and the ones this message changed.

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

### levels

> `readonly` **levels**: readonly [`PriceVolume`](PriceVolume.md)[]

Every level, ascending by price: the same array as getCumulativeVolume. A snapshot starts them over.

***

### changed

> `readonly` **changed**: readonly [`PriceVolume`](PriceVolume.md)[]

The levels this message changed, each price once with its new volume, ascending. On `initial` and `snapshot`
the levels start over, so it's every level and any other level a consumer kept is gone.
