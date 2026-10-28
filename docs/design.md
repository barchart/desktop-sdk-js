# Design

How the SDK works inside: for contributors, and for anyone porting it to another language. The behavior it implements is in the [reference](reference.md); this explains the structure behind it and why.

## 1. Principles

- **Protocol state, not interpretation.** The SDK keeps what Openfeed sends, scaled and grouped as the protocol groups it. Anything that interprets it stays out: derived fields such as a session-aware last price or a price change, enriched instrument data, spread aliases, computed analytics such as option Greeks. Applications build those on top.
- **No new wire protocol.** The SDK speaks standard Openfeed, through each language's Openfeed client. The Barchart Desktop API sends standard Openfeed messages too.
- **One spec, several languages.** TypeScript is the reference implementation. The reference, this document and the fixtures (§9) are what other ports follow, so behavior is written down rather than left to the code.
- **A portable core.** The SDK depends only on the Openfeed client and `long`. No DOM (`window`, `document`), no date library. Its one wait is the opt-in coalescing interval (§7).
- **One visible flow.** Subscribing and closing go through one loop (§5); messages go through one path (§3). No hidden deferrals, proxies or microtask tricks.

## 2. Layout

```
src/
  index.ts             the public entry; everything else is internal
  desktop-sdk.ts       the facade: login and connection state, the subscription and delivery loops, routing, raw access
  instrument-store.ts  state per market (marketId); applies snapshots and updates
  registry.ts          Openfeed subscriptions with their subscribers, dependencies and named markets
  subscriber.ts        one subscribe call and its handle, and the state and error its entry gives it
  types.ts             public types: events, listeners, Subscription, SubscriptionError, ConnectionState
  instrument.ts        Instrument: scaling, price format, formatPrice / parsePrice
  price-format.ts      the price format rules, formatPrice and formatDecimal
  formatted-quote.ts   FormattedQuote: a quote's groups as strings, formatted when read
  formatted-view.ts    what the groups' views share: values, decimal, toJSON
  formatted-session.ts, formatted-best-bid-offer.ts   the groups' views, a getter per field
  trade-date.ts        TradeDate (a date without a time)
  resolution-source.ts a promise settled from outside, for the loops' wake-ups and requestSnapshot
  reducers/
    quote.ts           QuoteRecord: applySnapshot, applyUpdate
    book.ts            Book: bookFromSnapshot, applyDepth
    cumulative.ts      cumulative volume as ordered steps: seed, trades, last
test/                  Vitest: reducers, formatting, store, registry, facade, coalescing
docs/                  the reference and this document
```

## 3. On top of the Openfeed client

The SDK uses the Openfeed client as it is; how the client connects, reconnects and resubscribes is in [its documentation](https://github.com/openfeed-org/sdk-js).

- **One client per login.** `login` constructs an `OpenFeedClient`, since it takes its credentials and listeners in its constructor; `logout` disposes it.
- **Subscribing:** `client.subscribe` and `client.unsubscribe`. Responses are matched by symbol and subscription type, since the client's id is local to it. `client.unsubscribe` is called in `try/catch`.
- **Messages** come through the client's `onMessageWithMetadata`. The core uses only protocol fields; the metadata is only passed on to raw listeners.
- **Connection state and heartbeats** come from the client's listeners.

**Each message, in order:**

1. the store applies it (§4);
2. state subscribers get their events, and raw subscribers get the message;
3. the `raw.onMessage` listeners run.

Listeners are called inside `try/catch`: one that throws is logged, and the rest still run.

**Ports:** the SDK relies on its Openfeed client to reconnect and resubscribe. A port whose client doesn't has to add it.

## 4. Instrument store

One state per `marketId`, since a `marketId` is one listed instrument on its exchange: the `Instrument`, the quote record, the book, the cumulative volume (a map from price to volume, and its ascending levels), and the last snapshot and last applied update.

- **State only.** Which subscribed symbol names which market is the registry's (§6); the store's getters take a `marketId`, and the facade resolves a symbol first.
- **Instrument-symbol index:** every definition maps its own `symbol` to its market. The facade falls back to it when no subscription under a symbol names a market. That's how a root subscription's instruments, and any instrument by its own symbol, are found.
- **Definitions** create a market, or replace its instrument and keep its state.
- **Snapshots and updates without a definition** are skipped: there's nothing to scale them with.
- **Snapshots** replace the market's state; **updates** go through the reducers below, once the market has had a snapshot.
- **Lifetime:** the store never drops a market by itself. The facade drops it once no subscription names it (the registry's market index); a raw subscription such as a root names its instruments without linking them, and holds them while it's open. `logout` clears the whole store.
- **`EXCHANGE_MOVE`** moves a market's state and its index entry to the new `marketId`.
- **Freezing:** records, books (with their arrays and levels) and level lists are frozen as they're stored.

**Reducers** are pure functions of `(state, message, instrument)` with no I/O, clock, logger or date library (the book's warnings go to a logger passed in):

- **Quote:** `applySnapshot(snapshot, instrument)` returns a whole record; `applyUpdate(record, update, instrument, tradesLastSize)` returns a new record, or the same one if nothing changed. One `readSession` reads either session from a snapshot. A `trades` update writes each session only if it touched it, so an untouched session stays the same object.
- **Book:** returns new objects instead of changing the old ones.
- **Cumulative volume:** seeded from the snapshot's volume at price, then built from trades. The reducer returns **ordered steps**, `{ price, delta }`, not levels, since `lastSize` and the totals depend on their order. The store applies the steps in order and hands out the resulting levels.

## 5. The subscription loop

`subscribe` and `close()` only queue a request; there are no timers.

- **`subscribe`** returns a `pending` handle at once.
- **`close()`** marks the subscriber closed at once (so no callback arrives after it), then queues its release.
- **The loop** sleeps on a promise until something is queued, then processes everything queued so far as one batch:
    1. **subscribes** join their registry entries, created (and sent, when logged in) if new; a subscriber closed in the same batch is skipped;
    2. **closes** leave their entries; at zero references an entry is unsubscribed (when logged in) and removed, its dependencies are released, and markets no subscription names any more leave the store;
    3. **first deliveries** for the subscribers that joined: the error they'd see, or one `initial` event.
- **Only subscribe and close go through the loop.** Nothing else may be added to it.

**Why:** the first callback comes after `subscribe` returned, so the caller holds its handle and has finished its setup; a subscribe and close in one task never reach the wire; a remount (close, then subscribe to the same key) keeps the entry, because subscribes are applied before closes. In threaded languages the loop is the SDK's dispatch queue.

## 6. The registry

One entry per `(service, subscription type, symbol)`, in two layers:

- **Desired, kept across logins:** the key, the subscribers, a reference count (subscribers plus dependent entries), the entries that depend on it, and its dependencies. At zero references the entry is removed.
- **Wire, for one login:** the client's id, the status (`pending`, `active`, `error`), the error, the last response, and the markets its successful responses named.

**Operations:**

- **`acquire`:** finds the entry for the key, or creates it and takes references on its dependencies; sends a new entry when a client is attached; counts the reference.
- **`remove`:** gives back a reference. At zero the entry is unsubscribed (when a client is attached; `client.unsubscribe` in `try/catch`), deleted, and its dependencies give back theirs, which can remove them too.
- **`attach(client)`** at login sends every entry on the new client. **`detach()`** at logout or rejected credentials resets every entry's wire layer, without unsubscribing: the client is being thrown away.
- **Responses** are matched by symbol and type. `SUCCESS` makes the entry `active` and records the response's `marketId` (0 names nothing). Anything else makes it `error`, and calls every subscriber's `onError`. Errors on unsubscribe responses are ignored.
- **Instrument actions:** `ALIAS_CHANGED` makes the alias's entries stop naming the old market (the server's repeated response names the new one); `EXCHANGE_MOVE` moves the named markets with the instrument.

**Links.** A symbol links to the markets its entries named only while a state subscriber, or a dependent entry, is on one of them. That's computed, not stored, so it stops the moment the last one leaves. Raw subscribers never link, so a root subscription (one symbol, many markets) doesn't move its symbol from market to market.

**Indexes:** entries by symbol and by market, updated wherever entries are created or deleted and wherever an entry's markets change, so every per-message lookup is a map lookup.

**Dependencies.** A `CUMULATIVE_VOLUME` entry depends on `ALL` on `REAL_TIME` for its symbol: its own subscription only sends the seed, and the levels then change with the trades `ALL` carries. It's the same key a quote subscription uses by default, so they share one entry in either order. The dependent entries are kept on the dependency, so its failure reaches them: a subscriber sees its entry's own error, or else a failed dependency's. Each entry's own status stays as the server answered it, for diagnostics, and a dependency that recovers clears it.

**Why the registry is the only record of links:** keeping a copy elsewhere (a symbol-to-market map in the store, say) means two places to keep in step through rolls, exchange moves, logouts and closes. The registry's named markets already say it.

## 7. Handles and routing

- **The handle** a subscriber gets is frozen, with `state`, `error` and `close()`, built from closures over the internal subscriber. It has no reference to the subscriber, its entry or the reference count, so nothing reaches them, even with `as any`.
- **The package entry exports only the public API.** The registry, entries, subscribers and the store are shared only between the SDK's own files.
- **Methods:** each subscriber has one, `quote`, `depth`, `cumulativeVolume` or `raw`, which decides the events it gets; `raw` gets none.
- **Events** for a message go to each symbol linked to the market, each entry under that symbol, and each subscriber on the entry, according to its method. Delivery iterates over copies, so a listener may subscribe or close while events are delivered.
- **Raw messages** go to raw subscribers, and to state subscribers whose listener has `onMessage`: every response for their entry, and every message for a market their entry named, after the state events.
- **First delivery:** the error the subscriber sees, or the market's current state as one `initial` event, with the last snapshot message as `raw`. Nothing if the market has no state yet.
- **Coalescing (`coalesceIntervalMs`):** a message's change is applied to the store at once, then held by market instead of routed. A later change to the same market merges into it: each part is the latest one, a snapshot anywhere makes it a snapshot, and cumulative volume's `changed` levels add up. A delivery loop, like the subscription loop, sleeps until a change is held, waits out the interval, then routes every held change as above, to the subscriptions open then. Logout and rejected credentials drop what's held, since the store is cleared. Off by default, so the one path stays an event per message.

## 8. What goes on the wire

| Sequence (in one task unless noted) | Wire traffic |
|---|---|
| `subscribeQuote("ZCZ26")` | `subscribe ALL ZCZ26` in the next batch. Later, the response makes it `active`, and the definition and snapshot produce a `snapshot` event. |
| A second `subscribeQuote("ZCZ26")` | None. The new subscriber gets `initial` in the next batch. |
| `close()`, then `subscribeQuote("ZCZ26")` (a remount) | None. The subscribe is applied before the close, so the count never reaches zero. |
| `subscribeQuote("ZCZ26")`, then `close()` | None. The subscriber is skipped in its own batch. |
| `close()` on the last subscriber | `unsubscribe` in the next batch. The market's state goes once no subscription names it. |
| `subscribeCumulativeVolume("ESZ26")` without a quote | `subscribe CUMULATIVE_VOLUME ESZ26` (on `REAL_TIME_SNAPSHOT`) and `subscribe ALL ESZ26`. |
| `subscribeCumulativeVolume("ESZ26")` with a quote, opened before or after | Only `subscribe CUMULATIVE_VOLUME`, or only the quote's `subscribe ALL`: they share the `ALL` entry. |
| `subscribeQuote("XXX")` → `INVALID_SYMBOL` | `onError`. Later subscribers get the same error, until all have closed; then the next subscribe asks again. |
| `raw.subscribe("ZC^UDS", ALL)` | `subscribe ALL ZC^UDS`. Its response names no market. Each instrument's definition indexes its own symbol; their state stays while the subscription is open. |
| `raw.requestSnapshot("ESZ26")` | `subscribe ALL ESZ26` on `REAL_TIME_SNAPSHOT`; the first snapshot resolves it, and the subscription closes in the next batch. |
| Disconnect and reconnect | Nothing from the SDK. The client re-sends every subscription; the new snapshots arrive as `snapshot` events. |
| Subscribing while logged out | Nothing. The entry is `pending` and is sent at the next login. |
| `logout()` | Nothing: the client is disposed, not unsubscribed from. Entries go back to `pending`, the store is cleared, subscribers stay. |
| `login()` again, as anyone | `subscribe` for every entry. The previous login's errors are gone. |
| `ALIAS_CHANGED` for `CL*1` | Nothing from the SDK. The alias stops naming the old contract; the server's repeated response names the new one, and its snapshot arrives as a `snapshot` event. |
| `EXCHANGE_MOVE` | Nothing. The state and the named markets move to the new `marketId`. |

## 9. Portability and fixtures

| Part | How it stays the same across languages |
|---|---|
| Reducers, scaling, price formatting | Pure functions, checked by **state fixtures** |
| Registry and subscription loop | A state machine (states, events, transitions, wire requests), checked by **transcript fixtures** that stub the client's `subscribe` and `unsubscribe` |
| Callbacks, threading, wrappers | Per language, by design. Only the delivery guarantees are fixed. |

**Types:** protocol messages come from each language's generated proto code. The SDK's own types (records, events, `Instrument`, errors) are hand-written from the reference; they're small, and a generator would cost more than it saves.

**Numbers:** `int64` values stay 64-bit integers until scaling. Scaled prices are IEEE 754 doubles from the same formula in every language (`instrument.ts`), so they all get the same cumulative volume keys. Fixtures compare prices with a tolerance of `1e-9`, and integers exactly.

**Dates:** each language's own types: TypeScript `Date` and `TradeDate`, Java `Instant` and `LocalDate`, C# `DateTimeOffset` and `DateOnly`, Python `datetime` (UTC) and `date`, Go `time.Time` and a date struct.

**API style:** the same names everywhere, in each language's idiom: listener interfaces in Java and C#, callables in Python, a handler interface in Go. Reactive or async wrappers (RxJS, `Flow`, `IAsyncEnumerable`, channels) are optional extras on top.

**Fixture format:**

- **Message streams:** JSON Lines, one `OpenfeedGatewayMessage` per line in protobuf's [standard JSON encoding](https://protobuf.dev/programming-guides/json/), which every language's protobuf library reads.
- **Test cases:** JSON naming the stream, the instrument definition, and checkpoints `{ afterLine, expect: { quote | book | cv } }`.
- **Transcripts:** JSON steps such as `subscribe`, `close`, `receive` and `reconnect`, each with the requests expected on the wire.
- **Not YAML:** its implicit typing breaks `int64` values and symbols like `NO`.
- **Scenarios** are small and hand-picked: a snapshot and the few updates that exercise one rule (a depth add at the last level, a trade correction at `last`, a settlement).

## 10. Adding a subscription type

The registry, routing and handles don't depend on the type, so a new kind of protocol data is additive:

- a reducer and a record type in `reducers/`;
- its state on the store's market, and a flag on what a message changed;
- an event type, a subscriber method, `subscribe…` and `get…` on the facade, and the exports;
- a dependency in the registry only if the new type needs another subscription to stay current.
