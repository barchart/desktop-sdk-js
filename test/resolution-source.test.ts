import { describe, expect, it } from "vitest";
import { ResolutionSource } from "../src/resolution-source";
import { sleep } from "./helpers";

// Vitest fails the run on any unhandled rejection, so these also check that a rejection nobody asked for leaves no
// rejected promise behind.
describe("ResolutionSource", () => {
    it("leaves no rejected promise behind when nobody asked for it", () => {
        const source = new ResolutionSource<number>();
        source.reject(new Error("never asked"));
        expect(source.completed).toBe(true);
    });

    it("rejects a promise asked for after the rejection", async () => {
        const source = new ResolutionSource<number>();
        source.reject(new Error("late"));
        await sleep(0);
        await expect(source.whenCompleted).rejects.toThrow("late");
    });

    it("rejects a promise asked for before the rejection", async () => {
        const source = new ResolutionSource<number>();
        const { whenCompleted } = source;
        source.reject(new Error("early"));
        await expect(whenCompleted).rejects.toThrow("early");
    });

    it("settles once: later resolves and rejects are ignored", async () => {
        const source = new ResolutionSource<number>();
        source.resolve(1);
        source.resolve(2);
        source.reject(new Error("too late"));
        await expect(source.whenCompleted).resolves.toBe(1);
    });

    it("hands out the same promise on every read", () => {
        const source = new ResolutionSource<void>();
        expect(source.whenCompleted).toBe(source.whenCompleted);
        expect(source.completed).toBe(false);
    });
});
