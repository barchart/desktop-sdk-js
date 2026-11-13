[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / FormattedQuote

# Interface: FormattedQuote

A quote as strings, in the record's groups: each session and the best bid and offer, each with its native and
`decimal` notation; quantities with thousands separators in both. The status and dates stay on the record:
formatting dates takes a time zone and a locale. `JSON.stringify` gives every group's values.

## Properties

### session

> `readonly` **session**: [`FormattedSession`](../type-aliases/FormattedSession.md)

The current session.

***

### previousSession

> `readonly` **previousSession**: [`FormattedSession`](../type-aliases/FormattedSession.md)

The session before it.

***

### bestBidOffer

> `readonly` **bestBidOffer**: [`FormattedBestBidOffer`](../type-aliases/FormattedBestBidOffer.md)

The best bid and offer.
