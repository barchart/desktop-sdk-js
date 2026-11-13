[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / EventKind

# Type Alias: EventKind

> **EventKind** = `"initial"` \| `"snapshot"` \| `"update"`

- `initial`: the current state, delivered once to a new subscriber after `subscribe` returned; `raw` is the
  instrument's last snapshot message.
- `snapshot` / `update`: a message from the wire was just applied; `raw` is that message.
