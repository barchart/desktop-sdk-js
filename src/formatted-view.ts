// Internal: the base of a formatted quote's group views (formatted-session.ts, formatted-best-bid-offer.ts).
import type { Instrument, PriceNotation } from "./instrument";
import { formatDecimal } from "./price-format";

type NumberField<R> = { [K in keyof R]-?: R[K] extends number | null ? K : never }[keyof R];

/**
 * A group's prices and quantities as strings; "" for a field that isn't set. Over every number field of the record: a
 * class that implements it doesn't compile while a field added to the record has no getter, and a getter for a
 * removed field doesn't compile either.
 */
export type FormattedFields<R> = { readonly [F in NumberField<R>]: string };

/** The fields in one notation, each formatted when read, and `values`: all of them as a plain frozen object. */
export type FormattedView<R> = FormattedFields<R> & { readonly values: FormattedFields<R> };

/** A group in the instrument's native notation, and `decimal`, the same with prices in decimal notation. */
export type FormattedGroup<R> = FormattedView<R> & { readonly decimal: FormattedView<R> };

/** A quantity with thousands separators; "" for none. */
export const formatQuantity = (value: number | null): string => (value === null ? "" : formatDecimal(String(value)));

/** Each view class's own getters, the fields `values` lists, read once per class. */
const fieldNames = new WeakMap<object, readonly string[]>();

const getFieldNames = (prototype: object): readonly string[] => {
    let names = fieldNames.get(prototype);
    if (!names) {
        names = Object.entries(Object.getOwnPropertyDescriptors(prototype))
            .filter(([, descriptor]) => descriptor.get !== undefined)
            .map(([name]) => name);
        fieldNames.set(prototype, names);
    }
    return names;
};

/** What every group's view shares: `values`, `decimal`, `toJSON`, and formatting a price. */
export abstract class View<R> {
    #values: FormattedFields<R> | undefined;
    #decimal: View<R> | undefined;

    constructor(
        protected readonly record: R,
        protected readonly instrument: Instrument,
        protected readonly notation: PriceNotation
    ) {}

    /** The same kind of view, in another notation. */
    protected abstract inNotation(notation: PriceNotation): View<R>;

    /** Its fields are the getters of the subclass, the view's own prototype. */
    get values(): FormattedFields<R> {
        return (this.#values ??= Object.freeze(
            Object.fromEntries(getFieldNames(Object.getPrototypeOf(this) as object).map((field) => [field, this[field as keyof this]]))
        ) as FormattedFields<R>);
    }

    /** Built on its first read; it's the subclass's own kind of view, whose getters are the fields. */
    get decimal(): FormattedView<R> {
        return (this.#decimal ??= this.inNotation("decimal")) as FormattedView<R>;
    }

    toJSON(): object {
        return this.notation === "native" ? { ...this.values, decimal: this.decimal.values } : this.values;
    }

    protected price(price: number | null): string {
        return this.instrument.formatPrice(price, this.notation);
    }
}
