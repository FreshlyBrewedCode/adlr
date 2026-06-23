import { describe, expect, test } from "bun:test";
import { resolveMode } from "../src/resolve-mode";

describe("resolveMode", () => {
	test("standalone — no env vars set", () => {
		expect(resolveMode({})).toEqual({ mode: "standalone" });
	});

	test("standalone — only ADLR_SESSION set (no socket)", () => {
		expect(resolveMode({ ADLR_SESSION: "sess-1" })).toEqual({
			mode: "standalone",
		});
	});

	test("standalone — only ADLR_SOCKET set (no session)", () => {
		expect(resolveMode({ ADLR_SOCKET: "/tmp/adlr.sock" })).toEqual({
			mode: "standalone",
		});
	});

	test("session-attached — ADLR_SESSION + ADLR_SOCKET set, no ADLR_SPAN_ID", () => {
		expect(
			resolveMode({ ADLR_SESSION: "sess-2", ADLR_SOCKET: "/tmp/adlr.sock" }),
		).toEqual({
			mode: "session-attached",
			sessionId: "sess-2",
			socketPath: "/tmp/adlr.sock",
		});
	});

	test("managed — all three env vars set", () => {
		expect(
			resolveMode({
				ADLR_SOCKET: "/tmp/adlr.sock",
				ADLR_SESSION: "sess-3",
				ADLR_SPAN_ID: "span-abc",
			}),
		).toEqual({
			mode: "managed",
			spanId: "span-abc",
			sessionId: "sess-3",
			socketPath: "/tmp/adlr.sock",
		});
	});

	test("managed — ADLR_SPAN_ID set without session/socket (degenerate but valid)", () => {
		const result = resolveMode({ ADLR_SPAN_ID: "span-xyz" });
		expect(result.mode).toBe("managed");
		if (result.mode === "managed") {
			expect(result.spanId).toBe("span-xyz");
		}
	});
});
