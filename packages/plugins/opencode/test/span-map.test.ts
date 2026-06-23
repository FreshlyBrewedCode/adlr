import { beforeEach, describe, expect, test } from "bun:test";
import { SpanMap } from "../src/span-map";

describe("SpanMap", () => {
	let map: SpanMap;

	beforeEach(() => {
		map = new SpanMap();
	});

	test("set and get a span ID", () => {
		map.set("oc-session-1", "adlr-span-1");
		expect(map.get("oc-session-1")).toBe("adlr-span-1");
	});

	test("get returns undefined for unknown session", () => {
		expect(map.get("unknown")).toBeUndefined();
	});

	test("has returns true when session is present", () => {
		map.set("oc-session-2", "adlr-span-2");
		expect(map.has("oc-session-2")).toBe(true);
	});

	test("has returns false when session is absent", () => {
		expect(map.has("absent")).toBe(false);
	});

	test("markFinished sets isFinished to true", () => {
		map.set("oc-session-3", "adlr-span-3");
		expect(map.isFinished("oc-session-3")).toBe(false);
		map.markFinished("oc-session-3");
		expect(map.isFinished("oc-session-3")).toBe(true);
	});

	test("isFinished returns false for unknown session", () => {
		expect(map.isFinished("never-set")).toBe(false);
	});

	test("delete removes the session entry and clears finished state", () => {
		map.set("oc-session-4", "adlr-span-4");
		map.markFinished("oc-session-4");
		map.delete("oc-session-4");
		expect(map.has("oc-session-4")).toBe(false);
		expect(map.get("oc-session-4")).toBeUndefined();
		expect(map.isFinished("oc-session-4")).toBe(false);
	});

	test("multiple sessions are tracked independently", () => {
		map.set("s1", "span-1");
		map.set("s2", "span-2");
		map.markFinished("s1");

		expect(map.isFinished("s1")).toBe(true);
		expect(map.isFinished("s2")).toBe(false);
		expect(map.get("s2")).toBe("span-2");
	});
});
