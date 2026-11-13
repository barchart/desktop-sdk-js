[**@barchart/desktop-sdk-js**](../README.md)

***

[@barchart/desktop-sdk-js](../README.md) / FormattedBestBidOffer

# Type Alias: FormattedBestBidOffer

> **FormattedBestBidOffer** = `FormattedGroup`\<[`BestBidOfferRecord`](../interfaces/BestBidOfferRecord.md)\>

The best bid and offer as strings, with the same field names as [BestBidOfferRecord](../interfaces/BestBidOfferRecord.md); `""` for a field that
isn't set. Prices are in the instrument's own notation, and in decimal notation under `decimal`. `values` has every
field as one plain object.
