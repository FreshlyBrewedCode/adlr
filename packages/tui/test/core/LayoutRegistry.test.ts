import { beforeEach, describe, expect, test } from "bun:test";
import { LayoutRegistry } from "../../src/core/LayoutRegistry";
import type { LayoutDefinition } from "../../src/core/types";

describe("LayoutRegistry", () => {
	beforeEach(() => {
		LayoutRegistry.clear();
	});

	test("register and get layout", () => {
		const layout: LayoutDefinition = { id: "test", component: () => null };
		LayoutRegistry.register(layout);
		expect(LayoutRegistry.get("test")).toBe(layout);
	});

	test("duplicate id overwrites", () => {
		const first = { id: "dup", component: () => null };
		const second = { id: "dup", component: () => null };
		LayoutRegistry.register(first);
		LayoutRegistry.register(second);
		expect(LayoutRegistry.get("dup")).toBe(second);
	});

	test("get returns undefined for unknown id", () => {
		expect(LayoutRegistry.get("unknown")).toBeUndefined();
	});

	test("getAll returns all layouts", () => {
		LayoutRegistry.register({ id: "a", component: () => null });
		LayoutRegistry.register({ id: "b", component: () => null });
		const all = LayoutRegistry.getAll();
		expect(all).toHaveLength(2);
		expect(all.map((l) => l.id)).toEqual(["a", "b"]);
	});
});
