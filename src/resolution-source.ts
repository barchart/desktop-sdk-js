// Internal: a promise settled from outside, for the subscription and delivery loops and raw.requestSnapshot.

type State<T> =
    { readonly kind: "pending" } | { readonly kind: "resolved"; readonly value: T } | { readonly kind: "rejected"; readonly error: Error };

/**
 * A promise settled from outside: `resolve` or `reject` it once (later calls do nothing), and `whenCompleted` is the
 * promise. It's created on its first read, in the state the source is in by then, so a rejection nobody asked for
 * leaves no rejected promise behind, and one somebody asked for but didn't handle is reported by the platform as
 * unhandled, as any promise's would be. A rejection nobody reads isn't logged: whoever rejects with an error worth
 * seeing logs it.
 */
export class ResolutionSource<T> {
    #state: State<T> = { kind: "pending" };
    #promise: Promise<T> | undefined;
    #settle: { resolve(value: T): void; reject(error: Error): void } | undefined;

    get completed(): boolean {
        return this.#state.kind !== "pending";
    }

    get whenCompleted(): Promise<T> {
        if (!this.#promise) {
            const state = this.#state;
            if (state.kind === "resolved") {
                this.#promise = Promise.resolve(state.value);
            } else if (state.kind === "rejected") {
                this.#promise = Promise.reject(state.error);
            } else {
                this.#promise = new Promise<T>((resolve, reject) => {
                    this.#settle = { resolve, reject };
                });
            }
        }
        return this.#promise;
    }

    /** Bound, so it can be passed around as a callback. */
    readonly resolve = (value: T): void => {
        if (this.completed) {
            return;
        }
        this.#state = { kind: "resolved", value };
        this.#settle?.resolve(value);
    };

    /** Bound, so it can be passed around as a callback. */
    readonly reject = (error: Error): void => {
        if (this.completed) {
            return;
        }
        this.#state = { kind: "rejected", error };
        this.#settle?.reject(error);
    };
}
