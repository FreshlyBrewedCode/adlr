import { createServer, type Socket } from "node:net";
import type { Storage } from "@adlr/sdk";
import { getSocketPath } from "@adlr/sdk";
import { handleCommand } from "./handlers";
import type { InactivityTimer } from "./lifecycle";
import type { DaemonLogger } from "./logger";
import type { ProcessManager } from "./process-manager";

export function startServer(
	storage: Storage,
	getProcessManager: () => ProcessManager,
	inactivity: InactivityTimer,
	logger?: DaemonLogger,
	socketPath: string = getSocketPath(),
): {
	close: () => void;
	broadcast: (
		sessionId: string,
		event: { type: string; payload: unknown },
	) => void;
} {
	const subscribers = new Map<string, Set<{ write: (data: string) => void }>>();
	const clients = new Set<Socket>();

	function broadcast(
		sessionId: string,
		event: { type: string; payload: unknown },
	) {
		const set = subscribers.get(sessionId);
		if (set) {
			const data = `${JSON.stringify({
				type: "event",
				event: event.type,
				payload: event.payload,
			})}\n`;
			for (const client of set) {
				try {
					client.write(data);
				} catch (e) {
					const error = e instanceof Error ? e.message : String(e);
					console.error("Failed to broadcast to client:", error);
					logger?.error("Failed to broadcast to client", { error });
				}
			}
		}
	}

	const ctx = {
		storage,
		get processManager() {
			return getProcessManager();
		},
		subscribers,
		broadcast,
	};

	const server = createServer((socket) => {
		clients.add(socket);
		inactivity.addClient();

		let buffer = "";
		let subscribedSessionId: string | null = null;
		let subscriberEntry: { write: (data: string) => void } | null = null;
		let rawMode = false;
		let attachedSpanId: string | null = null;
		let attachCleanup: (() => void) | null = null;

		socket.on("data", async (data) => {
			if (rawMode && attachedSpanId) {
				const agent = getProcessManager().getAgent(attachedSpanId);
				if (agent) {
					agent.terminal.write(data.toString());
				}
				return;
			}

			buffer += data.toString();
			const parts = buffer.split("\n");
			buffer = parts.pop() ?? "";
			for (const line of parts) {
				if (!line) continue;
				try {
					const msg = JSON.parse(line) as {
						type: string;
						id: string;
						payload: unknown;
					};

					if (msg.type === "subscribe") {
						const { session_id } = msg.payload as { session_id: string };
						subscribedSessionId = session_id;
						const set = subscribers.get(session_id) ?? new Set();
						subscriberEntry = { write: (d: string) => socket.write(d) };
						set.add(subscriberEntry);
						subscribers.set(session_id, set);

						const snapshot = await handleCommand(ctx, "subscribe", {
							session_id,
						});
						socket.write(
							`${JSON.stringify({
								type: "response",
								id: msg.id,
								payload: snapshot,
							})}\n`,
						);
						continue;
					}

					if (msg.type === "agent.attach") {
						const { span_id } = msg.payload as { span_id: string };
						// Clean up previous attach if any
						if (attachCleanup) {
							attachCleanup();
							attachCleanup = null;
						}
						attachCleanup = getProcessManager().addAttachListener(
							span_id,
							(data) => {
								socket.write(data);
							},
						);
						rawMode = true;
						attachedSpanId = span_id;
						socket.write(
							`${JSON.stringify({
								type: "response",
								id: msg.id,
								payload: { attached: true },
							})}\n`,
						);
						// Log the attach event (fire-and-forget, don't block response)
						storage
							.getSpan(span_id)
							.then((span) => {
								if (span) {
									logger?.info(
										"Client attached to agent",
										{
											agent: String(span.data.agent_type ?? span.name),
										},
										{ session_id: span.session_id, span_id: span.id },
									);
								}
							})
							.catch(() => {});
						continue;
					}

					const result = await handleCommand(ctx, msg.type, msg.payload);
					socket.write(
						`${JSON.stringify({
							type: "response",
							id: msg.id,
							payload: result,
						})}\n`,
					);
				} catch (err) {
					const error = err instanceof Error ? err.message : String(err);
					// Try to parse id from malformed line
					let id = "unknown";
					try {
						const parsed = JSON.parse(line);
						id = parsed.id ?? "unknown";
					} catch {}
					socket.write(`${JSON.stringify({ type: "error", id, error })}\n`);
				}
			}
		});

		socket.on("close", () => {
			clients.delete(socket);
			inactivity.removeClient();
			if (subscribedSessionId && subscriberEntry) {
				const set = subscribers.get(subscribedSessionId);
				if (set) {
					set.delete(subscriberEntry);
				}
			}
			if (attachCleanup) {
				attachCleanup();
				attachCleanup = null;
			}
		});
	});

	server.listen(socketPath);

	return {
		close() {
			for (const client of clients) {
				client.end();
			}
			server.close();
		},
		broadcast,
	};
}
