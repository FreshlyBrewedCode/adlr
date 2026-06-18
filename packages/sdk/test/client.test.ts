import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { createServer, type Socket } from "node:net";
import { createClient } from "../src/client";

const FAKE_SOCK = "/tmp/fake-sdk-test.sock";

let clientSockets: Socket[] = [];
let nextSocketResolve: ((socket: Socket) => void) | null = null;

const server = createServer((socket) => {
	clientSockets.push(socket);
	if (nextSocketResolve) {
		nextSocketResolve(socket);
		nextSocketResolve = null;
	}
	socket.on("data", (data) => {
		const text = data.toString();
		for (const line of text.trim().split("\n")) {
			if (!line) continue;
			try {
				const msg = JSON.parse(line);
				if (msg.type === "session.create") {
					socket.write(
						`${JSON.stringify({
							type: "response",
							id: msg.id,
							payload: {
								id: "sess-1",
								status: "active",
								working_dir: "/tmp",
								created_at: 0,
							},
						})}\n`,
					);
				} else if (msg.type === "session.list") {
					socket.write(
						JSON.stringify({ type: "response", id: msg.id, payload: [] }) +
							"\n",
					);
				} else if (msg.type === "subscribe") {
					socket.write(
						JSON.stringify({ type: "response", id: msg.id, payload: {} }) +
							"\n",
					);
					// send a fake event
					socket.write(
						`${JSON.stringify({
							type: "event",
							event: "test",
							payload: { foo: 1 },
						})}\n`,
					);
				} else if (msg.type === "agent.list") {
					socket.write(
						JSON.stringify({ type: "response", id: msg.id, payload: [] }) +
							"\n",
					);
				} else if (msg.type === "agent.run") {
					socket.write(
						`${JSON.stringify({
							type: "response",
							id: msg.id,
							payload: {
								id: "span-1",
								session_id: msg.payload.session_id,
								name: msg.payload.name,
								kind: "agent",
								status: "running",
								parent_id: null,
								started_at: 0,
								finished_at: null,
								data: {},
							},
						})}\n`,
					);
				} else {
					socket.write(
						JSON.stringify({ type: "response", id: msg.id, payload: {} }) +
							"\n",
					);
				}
			} catch {
				// ignore
			}
		}
	});
	socket.on("close", () => {
		clientSockets = clientSockets.filter((c) => c !== socket);
	});
});
await new Promise<void>((resolve) => server.listen(FAKE_SOCK, () => resolve()));

function waitForSocket(): Promise<Socket> {
	return new Promise((resolve) => {
		nextSocketResolve = resolve;
	});
}

beforeEach(async () => {
	// Clean up any lingering sockets from previous tests
	for (const s of clientSockets) {
		try {
			s.destroy();
		} catch {
			/* ignore */
		}
	}
	clientSockets = [];
	nextSocketResolve = null;
	// give a moment for the server to clean up
	await new Promise((r) => setTimeout(r, 10));
});

afterAll(() => {
	for (const s of clientSockets) s.destroy();
	server.close();
});

describe("Client", () => {
	test("env reads ADLR_SESSION and ADLR_SPAN_ID", () => {
		const oldSession = process.env.ADLR_SESSION;
		const oldSpan = process.env.ADLR_SPAN_ID;
		process.env.ADLR_SESSION = "sess-123";
		process.env.ADLR_SPAN_ID = "span-456";

		const client = createClient(FAKE_SOCK);
		const env = client.env();
		expect(env.sessionId).toBe("sess-123");
		expect(env.spanId).toBe("span-456");

		process.env.ADLR_SESSION = oldSession;
		process.env.ADLR_SPAN_ID = oldSpan;
		client.close();
	});

	test("request/response matching", async () => {
		const client = createClient(FAKE_SOCK);
		const result = await client.session.create({ working_dir: "/tmp" });
		expect(result.id).toBe("sess-1");
		client.close();
	});

	test("message parsing handles multiple lines in one chunk", async () => {
		const client = createClient(FAKE_SOCK);
		const events: unknown[] = [];
		const unsub = client.on("event", (e) => events.push(e));

		const socket = await waitForSocket();
		socket.write(
			JSON.stringify({ type: "event", event: "ev1", payload: 1 }) +
				"\n" +
				JSON.stringify({ type: "event", event: "ev2", payload: 2 }) +
				"\n" +
				JSON.stringify({ type: "event", event: "ev3", payload: 3 }) +
				"\n",
		);

		await new Promise((r) => setTimeout(r, 50));
		expect(events.length).toBe(3);
		expect((events[0] as { payload: number }).payload).toBe(1);
		expect((events[1] as { payload: number }).payload).toBe(2);
		expect((events[2] as { payload: number }).payload).toBe(3);

		unsub();
		client.close();
	});

	test("event routing routes to matching handlers", async () => {
		const client = createClient(FAKE_SOCK);
		const events: unknown[] = [];
		client.on("event", (e) => events.push(e));

		const socket = await waitForSocket();
		socket.write(
			JSON.stringify({ type: "event", event: "routed", payload: { x: 1 } }) +
				"\n",
		);

		await new Promise((r) => setTimeout(r, 50));
		expect(events.length).toBe(1);
		client.close();
	});

	test("subscribe sends subscribe command and receives events", async () => {
		const client = createClient(FAKE_SOCK);
		const msgs: unknown[] = [];
		const unsub = await client.subscribe("sess-1", (msg) => msgs.push(msg));

		await new Promise((r) => setTimeout(r, 50));
		expect(msgs.length).toBeGreaterThanOrEqual(1);

		unsub();
		client.close();
	});

	test("on() unsubscribe removes only the registered entry", async () => {
		const client = createClient(FAKE_SOCK);
		const events: unknown[] = [];
		const handler = (e: unknown) => events.push(e);
		const unsub1 = client.on("event", handler);
		const unsub2 = client.on("event", handler);

		const socket = await waitForSocket();
		socket.write(
			`${JSON.stringify({ type: "event", event: "dup", payload: 1 })}\n`,
		);
		await new Promise((r) => setTimeout(r, 50));
		expect(events.length).toBe(2);

		unsub1();
		socket.write(
			`${JSON.stringify({ type: "event", event: "dup", payload: 2 })}\n`,
		);
		await new Promise((r) => setTimeout(r, 50));
		expect(events.length).toBe(3);

		unsub2();
		client.close();
	});

	test("close rejects pending requests", async () => {
		const client = createClient(FAKE_SOCK);
		const promise = client.agent.list();
		client.close();
		await expect(promise).rejects.toThrow("Socket closed");
	});

	test("client has all namespace methods", () => {
		const client = createClient(FAKE_SOCK);
		expect(client.session.create).toBeFunction();
		expect(client.session.list).toBeFunction();
		expect(client.agent.run).toBeFunction();
		expect(client.agent.wait).toBeFunction();
		expect(client.agent.status).toBeFunction();
		expect(client.agent.list).toBeFunction();
		expect(client.agent.attach).toBeFunction();
		expect(client.span.update).toBeFunction();
		expect(client.context.add).toBeFunction();
		expect(client.context.list).toBeFunction();
		expect(client.subscribe).toBeFunction();
		expect(client.on).toBeFunction();
		client.close();
	});

	test("agent.run converts camelCase keys to snake_case", async () => {
		const client = createClient(FAKE_SOCK);
		const socket = await waitForSocket();

		let receivedPayload: unknown;
		const originalOnData = socket.listeners("data")[0] as (
			data: Buffer,
		) => void;
		socket.removeListener("data", originalOnData);
		socket.on("data", (data) => {
			const text = data.toString();
			for (const line of text.trim().split("\n")) {
				if (!line) continue;
				try {
					const msg = JSON.parse(line);
					if (msg.type === "agent.run") {
						receivedPayload = msg.payload;
						socket.write(
							`${JSON.stringify({
								type: "response",
								id: msg.id,
								payload: {
									id: "span-1",
									session_id: msg.payload.session_id,
									name: msg.payload.name,
									kind: "agent",
									status: "running",
									parent_id: null,
									started_at: 0,
									finished_at: null,
									data: {},
								},
							})}\n`,
						);
						return;
					}
				} catch {
					// ignore
				}
			}
			originalOnData(data);
		});

		const result = await client.agent.run({
			sessionId: "sess-1",
			agentType: "test",
			prompt: "hello",
			name: "test-agent",
			parentSpanId: "span-0",
		});

		expect(result.id).toBe("span-1");
		expect(receivedPayload).toEqual({
			session_id: "sess-1",
			agent_type: "test",
			prompt: "hello",
			name: "test-agent",
			parent_span_id: "span-0",
		});

		client.close();
	});
});
