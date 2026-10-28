import type { BestBidOffer, Close, InstrumentTradingStatus, MarketSession, MarketSnapshot, MarketUpdate, Settlement } from "@openfeed/sdk-js";
import type Long from "long";
import type { Instrument } from "../instrument";
import { TradeDate } from "../trade-date";

/**
 * One trading session, as the protocol's MarketSession: what the feed sent, scaled, with no fallbacks between fields.
 * …Time ← transactionTime, always a Date (JavaScript's built-in: an instant, ms since the Unix epoch, UTC).
 * …TradeDate ← tradeDate, always a TradeDate. Choosing between the two is the consumer's business.
 * Both sessions have every field; a field the protocol doesn't send for a session stays null (the previous
 * session's `close`, say).
 */
export interface SessionRecord {
    readonly tradeDate: TradeDate | null;

    readonly open: number | null;
    readonly high: number | null;
    readonly low: number | null;

    readonly close: number | null;
    readonly closeTime: Date | null;
    readonly closeTradeDate: TradeDate | null;

    readonly settle: number | null;
    readonly settleTime: Date | null;
    readonly settleTradeDate: TradeDate | null;
    readonly settlePreliminary: boolean | null;

    readonly prevSettle: number | null;
    readonly prevSettleTime: Date | null;
    readonly prevSettleTradeDate: TradeDate | null;

    readonly last: number | null;
    readonly lastTime: Date | null;
    readonly lastTradeDate: TradeDate | null;
    readonly lastSize: number | null;
    readonly lastTrade: number | null;

    readonly volume: number | null;
    readonly openInterest: number | null;
    readonly numberOfTrades: number | null;
}

/** The best bid and offer, as the protocol's BestBidOffer. In an update a missing side arrives as zeros (no bid). */
export interface BestBidOfferRecord {
    readonly bidPrice: number | null;
    readonly bidSize: number | null;
    readonly bidOrderCount: number | null;
    readonly askPrice: number | null;
    readonly askSize: number | null;
    readonly askOrderCount: number | null;
}

/** The instrument's trading status, as the protocol's InstrumentStatus. */
export interface StatusRecord {
    readonly trading: InstrumentTradingStatus | null;
    readonly prior: InstrumentTradingStatus | null;
    /** The status's session date; a snapshot without a status gives its own trade date. */
    readonly tradeDate: TradeDate | null;
    /** When the status changed (status updates only). */
    readonly time: Date | null;
}

/**
 * A market's quote state, in the protocol's groups: the current and previous sessions, the best bid and offer, and the
 * trading status. A group object is replaced only when a message changed it, so an unchanged group is the same object
 * as before.
 */
export interface QuoteRecord {
    readonly session: SessionRecord;
    readonly previousSession: SessionRecord;
    readonly bestBidOffer: BestBidOfferRecord;
    readonly status: StatusRecord;
}

/** A session the snapshot doesn't carry: every field null. */
const emptySessionRecord: SessionRecord = Object.freeze({
    tradeDate: null,
    open: null,
    high: null,
    low: null,
    close: null,
    closeTime: null,
    closeTradeDate: null,
    settle: null,
    settleTime: null,
    settleTradeDate: null,
    settlePreliminary: null,
    prevSettle: null,
    prevSettleTime: null,
    prevSettleTradeDate: null,
    last: null,
    lastTime: null,
    lastTradeDate: null,
    lastSize: null,
    lastTrade: null,
    volume: null,
    openInterest: null,
    numberOfTrades: null,
});

interface Stamped {
    price: Long;
    transactionTime: Long;
    tradeDate: number;
}

/**
 * What a session is read from: the snapshot's top level (the current session, which also carries `close`) or a
 * MarketSession (the previous one, which also carries `prevSettlement`). The fields they share have the same types.
 */
type SessionMessage = Pick<
    MarketSession,
    "tradeDate" | "open" | "high" | "low" | "last" | "lastTrade" | "settlement" | "volume" | "openInterest" | "numberOfTrades"
> & { readonly close?: Close; readonly prevSettlement?: Settlement };

/** 0 is proto3's "not set". Nanoseconds are truncated to whole milliseconds, a `Date`'s precision. */
export const toTime = (nanos: Long | undefined): Date | null => {
    if (!nanos || nanos.isZero()) {
        return null;
    }
    return new Date(nanos.div(1_000_000).toNumber());
};

/** Writes `${k}`, `${k}Time` and `${k}TradeDate` from any { price, transactionTime, tradeDate }; nulls without one. */
const stamped = <K extends string>(k: K, v: Stamped | undefined, i: Instrument) =>
    ({
        [k]: i.price(v?.price),
        [`${k}Time`]: toTime(v?.transactionTime),
        [`${k}TradeDate`]: TradeDate.fromProto(v?.tradeDate),
    }) as { [P in K]: number | null } & { [P in `${K}Time`]: Date | null } & {
        [P in `${K}TradeDate`]: TradeDate | null;
    };

const bbo = (b: BestBidOffer | undefined, i: Instrument): BestBidOfferRecord =>
    Object.freeze({
        bidPrice: i.price(b?.bidPrice),
        askPrice: i.price(b?.offerPrice),
        // the sizes as sent: not scaled
        bidSize: b?.bidQuantity.toNumber() ?? null,
        askSize: b?.offerQuantity.toNumber() ?? null,
        bidOrderCount: b?.bidOrderCount ?? null,
        askOrderCount: b?.offerOrderCount ?? null,
    });

/** The current session with these fields changed. */
const inSession = (q: QuoteRecord, fields: Partial<SessionRecord>): QuoteRecord => ({ ...q, session: Object.freeze({ ...q.session, ...fields }) });

/**
 * One session from a snapshot. `settleDateFromSession`: a settlement without a date takes the session's date, which
 * has only ever applied to the previous session.
 */
const readSession = (s: SessionMessage, i: Instrument, settleDateFromSession: boolean): SessionRecord => {
    const settle = stamped("settle", s.settlement, i);
    return Object.freeze({
        tradeDate: TradeDate.fromProto(s.tradeDate),

        open: i.price(s.open?.price),
        high: i.price(s.high?.price),
        low: i.price(s.low?.price),

        ...stamped("close", s.close, i),

        ...settle,
        settleTradeDate:
            s.settlement && settleDateFromSession ? (settle.settleTradeDate ?? TradeDate.fromProto(s.tradeDate)) : settle.settleTradeDate,
        settlePreliminary: s.settlement?.preliminarySettle ?? null,

        ...stamped("prevSettle", s.prevSettlement, i),

        ...stamped("last", s.last, i),
        // as sent: not scaled in snapshots
        lastSize: s.last?.quantity.toNumber() ?? null,
        lastTrade: i.price(s.lastTrade?.price),

        volume: i.quantity(s.volume?.volume),
        openInterest: i.quantity(s.openInterest?.volume),
        numberOfTrades: s.numberOfTrades?.numberTrades.toNumber() ?? null,
    });
};

/** A snapshot replaces every field; anything the snapshot doesn't carry becomes null. */
export const applySnapshot = (snapshot: MarketSnapshot, i: Instrument): QuoteRecord => {
    const previous = snapshot.previousSession;
    const status = snapshot.instrumentStatus;

    return {
        session: readSession(snapshot, i, false),
        previousSession: previous ? readSession(previous, i, true) : emptySessionRecord,
        bestBidOffer: bbo(snapshot.bbo, i),
        status: Object.freeze({
            trading: status?.tradingStatus ?? null,
            prior: status?.priorTradingStatus ?? null,
            // `instrumentStatus?.tradeDate ?? tradeDate` on raw numbers: the snapshot's own date is used only when the
            // snapshot has no instrumentStatus; an unset (0) status date gives null.
            tradeDate: TradeDate.fromProto(status ? status.tradeDate : snapshot.tradeDate),
            // not read from snapshots
            time: null,
        }),
    };
};

/** The current session's fields a trades update changes: only those it carries. */
const getSessionChanges = (session: MarketSession, i: Instrument, tradesLastSize: number): Partial<SessionRecord> => ({
    ...(session.open ? { open: i.price(session.open.price) } : {}),
    ...(session.high ? { high: i.price(session.high.price) } : {}),
    ...(session.low ? { low: i.price(session.low.price) } : {}),
    ...(session.last ? { ...stamped("last", session.last, i), lastSize: tradesLastSize } : {}),
    ...(session.lastTrade ? { lastTrade: i.price(session.lastTrade.price) } : {}),
    ...(session.settlement ? { ...stamped("settle", session.settlement, i), settlePreliminary: session.settlement.preliminarySettle } : {}),
    ...(session.openInterest ? { openInterest: i.quantity(session.openInterest.volume) } : {}),
    ...(session.numberOfTrades ? { numberOfTrades: session.numberOfTrades.numberTrades.toNumber() } : {}),
    ...(session.volume ? { volume: i.quantity(session.volume.volume) } : {}),
});

/**
 * The previous session's fields a trades update changes: only those it carries. The current session's
 * `prevSettlement` is the previous session's settlement: one field, and the previous session's own wins.
 */
const getPreviousSessionChanges = (
    prevSettlement: Settlement | undefined,
    previous: MarketSession | undefined,
    i: Instrument
): Partial<SessionRecord> => ({
    ...(prevSettlement ? stamped("settle", prevSettlement, i) : {}),
    ...(previous?.last ? stamped("last", previous.last, i) : {}),
    ...(previous?.settlement ? stamped("settle", previous.settlement, i) : {}),
    ...(previous?.open ? { open: i.price(previous.open.price) } : {}),
    ...(previous?.high ? { high: i.price(previous.high.price) } : {}),
    ...(previous?.low ? { low: i.price(previous.low.price) } : {}),
    ...(previous?.volume ? { volume: i.quantity(previous.volume.volume) } : {}),
    ...(previous?.openInterest ? { openInterest: i.quantity(previous.openInterest.volume) } : {}),
});

/** A session group is a new object only when the update changed one of its fields. */
const applyTradesUpdate = (q: QuoteRecord, u: MarketUpdate, i: Instrument, tradesLastSize: number): QuoteRecord => {
    const session = u.session ? getSessionChanges(u.session, i, tradesLastSize) : {};
    const previous = getPreviousSessionChanges(u.session?.prevSettlement, u.previousSession, i);
    const sessionChanged = Object.keys(session).length > 0;
    const previousChanged = Object.keys(previous).length > 0;
    if (!sessionChanged && !previousChanged) {
        return q;
    }
    return {
        ...q,
        session: sessionChanged ? Object.freeze({ ...q.session, ...session }) : q.session,
        previousSession: previousChanged ? Object.freeze({ ...q.previousSession, ...previous }) : q.previousSession,
    };
};

/**
 * MarketUpdate.data is a proto oneof, so exactly one branch applies. Only fields the update carries are written.
 * `tradesLastSize` is the size traded at `last` in this trades update, computed by the cumulative-volume reducer.
 */
export const applyUpdate = (q: QuoteRecord, u: MarketUpdate, i: Instrument, tradesLastSize = 0): QuoteRecord => {
    if (u.trades) {
        return applyTradesUpdate(q, u, i, tradesLastSize);
    }
    if (u.bbo) {
        return { ...q, bestBidOffer: bbo(u.bbo, i) };
    }
    // the other single-field updates are the current session's
    if (u.open) {
        return inSession(q, { open: i.price(u.open.price) });
    }
    if (u.high) {
        return inSession(q, { high: i.price(u.high.price) });
    }
    if (u.low) {
        return inSession(q, { low: i.price(u.low.price) });
    }
    if (u.close) {
        return inSession(q, stamped("close", u.close, i));
    }
    if (u.settlement) {
        return inSession(q, {
            ...stamped("settle", u.settlement, i),
            settlePreliminary: u.settlement.preliminarySettle,
        });
    }
    if (u.openInterest) {
        return inSession(q, { openInterest: i.quantity(u.openInterest.volume) });
    }
    if (u.numberOfTrades) {
        return inSession(q, { numberOfTrades: u.numberOfTrades.numberTrades.toNumber() });
    }
    if (u.volume) {
        return inSession(q, { volume: i.quantity(u.volume.volume) });
    }
    if (u.last) {
        return inSession(q, { ...stamped("last", u.last, i), lastSize: i.quantity(u.last.quantity) });
    }
    if (u.instrumentStatus) {
        const status = u.instrumentStatus;
        return {
            ...q,
            status: Object.freeze({
                trading: status.tradingStatus,
                prior: status.priorTradingStatus,
                tradeDate: TradeDate.fromProto(status.tradeDate),
                time: toTime(status.transactionTime),
            }),
        };
    }
    return q;
};
