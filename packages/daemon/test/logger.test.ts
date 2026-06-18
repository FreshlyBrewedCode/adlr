import { beforeEach, describe, expect, test } from "bun:test";
import { DAEMON_SESSION_ID, SQLiteStorage } from "@adler/sdk";
import { createLogger } from "../src/logger";

describe("createLogger", () => {
	let storage: SQLiteStorage;

	beforeEach(() => {
		storage = new SQLiteStorage(":memory:");
	});

	test("info writes a log.info event with __daemon__ session on first call", async () => {
		const logger = createLogger(storage);
		await logger.info("test message");

		const events = await storage.listEvents(DAEMON_SESSION_ID);
		expect(events).toHaveLength(1);
		expect(events[0].type).toBe("log.info");
		expect(events[0].session_id).toBe(DAEMON_SESSION_ID);
		expect(events[0].span_id).toBeNull();
		expect(events[0].data.message).toBe("test message");
	});

	test("warn writes a log.warn event", async () => {
		const logger = createLogger(storage);
		await logger.warn("something wrong", { path: "/foo" });

		const events = await storage.listEvents(DAEMON_SESSION_ID);
		expect(events[0].type).toBe("log.warn");
		expect(events[0].data.message).toBe("something wrong");
		expect(events[0].data.path).toBe("/foo");
	});

	test("error writes a log.error event", async () => {
		const logger = createLogger(storage);
		await logger.error("crash", { error: "boom" });

		const events = await storage.listEvents(DAEMON_SESSION_ID);
		expect(events[0].type).toBe("log.error");
		expect(events[0].data.error).toBe("boom");
	});

	test("sentinel session is created lazily on first log call", async () => {
		const logger = createLogger(storage);

		// No session yet
		const before = await storage.getSession(DAEMON_SESSION_ID);
		expect(before).toBeNull();

		await logger.info("hello");

		// Session now exists
		const after = await storage.getSession(DAEMON_SESSION_ID);
		expect(after).not.toBeNull();
		expect(after?.id).toBe(DAEMON_SESSION_ID);
	});

	test("sentinel session is only created once across multiple calls", async () => {
		const logger = createLogger(storage);
		await logger.info("first");
		await logger.info("second");
		await logger.warn("third");

		// Only one session row
		const sessions = await storage.listSessions();
		const daemonSessions = sessions.filter((s) => s.id === DAEMON_SESSION_ID);
		expect(daemonSessions).toHaveLength(1);

		// Three events
		const events = await storage.listEvents(DAEMON_SESSION_ID);
		expect(events).toHaveLength(3);
	});

	test("ctx overrides session_id and span_id for session-scoped events", async () => {
		// Must create the session first since events FK references sessions
		await storage
			.createSession({ working_dir: "/tmp" })
			.then(async (session) => {
				const span = await storage.createSpan({
					session_id: session.id,
					kind: "agent",
					name: "test-agent",
					status: "running",
				});

				const logger = createLogger(storage);
				await logger.info(
					"Agent started",
					{ agent: "opencode" },
					{ session_id: session.id, span_id: span.id },
				);

				const events = await storage.listEvents(session.id);
				expect(events).toHaveLength(1);
				expect(events[0].session_id).toBe(session.id);
				expect(events[0].span_id).toBe(span.id);
				expect(events[0].type).toBe("log.info");
			});
	});
});
