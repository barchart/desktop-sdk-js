[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / MessageMetadata

# Interface: MessageMetadata

What the Openfeed client knows about a message beyond the protocol: its symbol names and the market's definition.

## Properties

### symbolNames

> `readonly` **symbolNames**: readonly `string`[]

The names the message's instrument was subscribed under.

***

### definition

> `readonly` **definition**: `InstrumentDefinition` \| `undefined`

The instrument's definition, if the client has it.
