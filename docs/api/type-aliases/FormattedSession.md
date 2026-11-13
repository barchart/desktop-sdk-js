[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / FormattedSession

# Type Alias: FormattedSession

> **FormattedSession** = `FormattedGroup`\<[`SessionRecord`](../interfaces/SessionRecord.md)\>

A session's prices and quantities as strings, with the same field names as [SessionRecord](../interfaces/SessionRecord.md); `""` for a field
that isn't set. Prices are in the instrument's own notation, and in decimal notation under `decimal`. `values` has
every field as one plain object.

## Example

```ts
formatted.session.last; // "112-16"
formatted.session.decimal.last; // "112.50000"
formatted.session.volume; // "1,234"
```
