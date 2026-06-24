import { afterEach, describe, expect, test } from "bun:test";
import { ObservabilityPlugin } from "../src/index";

describe("ObservabilityPlugin", () => {
	afterEach(() => {
		for (const key of ["ADLR_SPAN_ID", "ADLR_SESSION", "ADLR_SOCKET"]) {
			delete process.env[key];
		}
	});

	test("is a function (plugin factory)", () => {
		expect(typeof ObservabilityPlugin).toBe("function");
	});

	test("standalone mode — returns object with event hook (no env vars)", async () => {
		delete process.env.ADLR_SPAN_ID;
		delete process.env.ADLR_SESSION;
		delete process.env.ADLR_SOCKET;

		const plugin = await ObservabilityPlugin({});
		expect(plugin).toBeObject();
		expect(typeof plugin.event).toBe("function");
	});

	test("standalone mode — event hook is a no-op and resolves without throwing", async () => {
		delete process.env.ADLR_SPAN_ID;
		delete process.env.ADLR_SESSION;
		delete process.env.ADLR_SOCKET;

		const plugin = await ObservabilityPlugin({});
		const event = plugin.event as (args: { event: unknown }) => Promise<void>;
		await expect(
			event({
				event: {
					type: "session.created",
					properties: { info: { id: "x", parentID: "y" } },
				},
			}),
		).resolves.toBeUndefined();
	});

	test("managed mode — plugin resolves to object with event hook", async () => {
		process.env.ADLR_SPAN_ID = "span-123";
		process.env.ADLR_SESSION = "sess-123";
		process.env.ADLR_SOCKET = "/tmp/nonexistent-adlr-managed.sock";

		const plugin = await ObservabilityPlugin({});
		expect(typeof plugin.event).toBe("function");
	});

	test("session-attached mode — plugin resolves to object with event hook", async () => {
		delete process.env.ADLR_SPAN_ID;
		process.env.ADLR_SESSION = "sess-456";
		process.env.ADLR_SOCKET = "/tmp/nonexistent-adlr-attached.sock";

		const plugin = await ObservabilityPlugin({});
		expect(typeof plugin.event).toBe("function");
	});

	test("event hook swallows handleEvent errors — never propagates to opencode", async () => {
		delete process.env.ADLR_SPAN_ID;
		delete process.env.ADLR_SESSION;
		delete process.env.ADLR_SOCKET;

		const plugin = await ObservabilityPlugin({});
		const event = plugin.event as (args: { event: unknown }) => Promise<void>;
		// Passing null triggers a type error inside handleEvent — must not throw
		await expect(event({ event: null })).resolves.toBeUndefined();
	});
});
