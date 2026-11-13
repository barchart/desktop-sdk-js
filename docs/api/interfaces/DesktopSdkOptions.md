[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / DesktopSdkOptions

# Interface: DesktopSdkOptions

Options for [DesktopSdk](../classes/DesktopSdk.md)'s constructor.

## Properties

### logger?

> `readonly` `optional` **logger?**: [`SdkLogger`](SdkLogger.md)

Where the SDK and the Openfeed client log, `console` by default.

***

### coalesceIntervalMs?

> `readonly` `optional` **coalesceIntervalMs?**: `number`

Holds subscription events for up to this many milliseconds, then delivers one per subscription with the latest
state, instead of one per message. Unset or 0: an event per message.
