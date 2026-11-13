[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / ConnectionState

# Type Alias: ConnectionState

> **ConnectionState** = `"logged-out"` \| `"connecting"` \| `"connected"` \| `"disconnected"` \| `"credentials-rejected"`

`credentials-rejected` lasts until the next `login` or `logout`.
`logout` returns to `logged-out` from any state.
