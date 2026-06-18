import { describe, expect, test } from "bun:test";
import { computeChildSize } from "../../src/core/splitUtils";

describe("computeChildSize", () => {
	describe("even division (no ratio)", () => {
		test("splits 100 into 2 equal parts", () => {
			expect(computeChildSize(100, 2, 0, undefined)).toBe(50);
			expect(computeChildSize(100, 2, 1, undefined)).toBe(50);
		});

		test("splits 100 into 3 parts with remainder on last", () => {
			expect(computeChildSize(100, 3, 0, undefined)).toBe(33);
			expect(computeChildSize(100, 3, 1, undefined)).toBe(33);
			expect(computeChildSize(100, 3, 2, undefined)).toBe(34);
		});

		test("total is preserved across all children", () => {
			const total = 97;
			const count = 4;
			const sizes = Array.from({ length: count }, (_, i) =>
				computeChildSize(total, count, i, undefined),
			);
			expect(sizes.reduce((s, v) => s + v, 0)).toBe(total);
		});
	});

	describe("ratio array", () => {
		test("[0.3, 0.7] on 100px", () => {
			expect(computeChildSize(100, 2, 0, [0.3, 0.7])).toBe(30);
			expect(computeChildSize(100, 2, 1, [0.3, 0.7])).toBe(70);
		});

		test("total is preserved with ratio array", () => {
			const total = 100;
			const ratio = [0.3, 0.7];
			const sizes = [0, 1].map((i) => computeChildSize(total, 2, i, ratio));
			expect(sizes.reduce((s, v) => s + v, 0)).toBe(total);
		});

		test("normalises ratio array that does not sum to 1", () => {
			// [0.6, 0.6] sums to 1.2 → normalised to [0.5, 0.5]
			expect(computeChildSize(100, 2, 0, [0.6, 0.6])).toBe(50);
			expect(computeChildSize(100, 2, 1, [0.6, 0.6])).toBe(50);
		});

		test("shorter ratio array distributes remainder evenly", () => {
			// [0.5] for 3 children: child 0 = 50%, children 1 and 2 share 50% = 25% each
			const total = 100;
			expect(computeChildSize(total, 3, 0, [0.5])).toBe(50);
			expect(computeChildSize(total, 3, 1, [0.5])).toBe(25);
			expect(computeChildSize(total, 3, 2, [0.5])).toBe(25);
		});

		test("total is preserved with rounding on odd dimensions", () => {
			const total = 101;
			const ratio = [0.3, 0.7];
			const sizes = [0, 1].map((i) => computeChildSize(total, 2, i, ratio));
			expect(sizes.reduce((s, v) => s + v, 0)).toBe(total);
		});
	});
});
