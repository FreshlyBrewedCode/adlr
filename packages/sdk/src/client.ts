import { connect } from "node:net";
import { SOCKET_PATH } from "./paths";
import type {
	AddContextItemInput,
	ContextItem,
	CreateSessionInput,
	Event,
	Session,
	Span,
	SpanStatus,
} from "./types";

export type IpcMessage =
	| { type: "response"; id: string; payload: unknown }
	| { type: "error"; id: string; error: string }
	| {
			type: "snapshot";
			payload: {
				session: Session;
				spans: Span[];
				events: Event[];
				context: ContextItem[];
			};
	  }
	| { type: "event"; event: string; payload: unknown };

type PendingRequest = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
};

export interface Client {
	env(): {
		sessionId: string | undefined;
		spanId: string | undefined;
		socketPath: string;
	};
	session: {
		create(data?: CreateSessionInput): Promise<Session>;
		list(): Promise<Session[]>;
	};
	agent: {
		run(data: {
			sessionId: string;
			agentType: string;
			prompt: string;
			name?: string;
			parentSpanId?: string;
		}): Promise<Span>;
		wait(data: { name: string } | { id: string }): Promise<Span>;
		status(data: { name: string } | { id: string }): Promise<SpanStatus>;
		list(): Promise<Span[]>;
		attach(nameOrId: string): Promise<void>;
	};
	span: {
		get(id: string): Promise<Span>;
		list(sessionId: string): Promise<Span[]>;
		update(
			id: string,
			data: Record<string, unknown>,
			options?: { merge?: boolean },
		): Promise<void>;
	};
	context: {
		add(data: AddContextItemInput): Promise<ContextItem>;
		list(): Promise<ContextItem[]>;
	};
	subscribe(
		sessionId: string,
		handler: (event: IpcMessage) => void,
	): Promise<() => void>;
	on(event: string, handler: (event: unknown) => void): () => void;
	close(): void;
}

export function createClient(socketPath: string = SOCKET_PATH): Client {
	const socket = connect(socketPath);
	const pending = new Map<string, PendingRequest>();
	let eventHandlers: Array<{
		event: string;
		handler: (event: unknown) => void;
	}> = [];
	let closed = false;
	let reqId = 0;

	function nextId(): string {
		return `req-${++reqId}`;
	}

	function ensureConnection(): Promise<void> {
		if (socket.readyState === "open") return Promise.resolve();
		return new Promise((resolve, reject) => {
			const onOpen = () => {
				cleanup();
				resolve();
			};
			const onError = (err: Error) => {
				cleanup();
				reject(err);
			};
			const cleanup = () => {
				socket.removeListener("connect", onOpen);
				socket.removeListener("error", onError);
			};
			socket.once("connect", onOpen);
			socket.once("error", onError);
		});
	}

	function toSnakeCase(value: unknown): unknown {
		if (Array.isArray(value)) {
			return value.map(toSnakeCase);
		}
		if (value !== null && typeof value === "object") {
			const result: Record<string, unknown> = {};
			for (const [key, val] of Object.entries(value)) {
				const snakeKey = key
					.replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
					.replace(/([a-z\d])([A-Z])/g, "$1_$2")
					.toLowerCase();
				result[snakeKey] = toSnakeCase(val);
			}
			return result;
		}
		return value;
	}

	function send<T>(type: string, payload: unknown): Promise<T> {
		if (closed) return Promise.reject(new Error("Client is closed"));
		const id = nextId();
		return new Promise((resolve, reject) => {
			pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
			ensureConnection()
				.then(() => {
					socket.write(
						`${JSON.stringify({ type, id, payload: toSnakeCase(payload) })}\n`,
					);
				})
				.catch(reject);
		});
	}

	let buffer = "";
	socket.on("data", (data) => {
		buffer += data.toString();
		const lines = buffer.split("\n");
		// Last element is either "" (if buffer ended with \n) or an incomplete line.
		// Either way, keep it as the new buffer and process everything before it.
		buffer = lines[lines.length - 1] ?? "";
		for (const line of lines.slice(0, -1)) {
			if (!line) continue;
			try {
				const msg = JSON.parse(line) as IpcMessage;
				if (msg.type === "response" || msg.type === "error") {
					const req = pending.get(msg.id);
					if (req) {
						pending.delete(msg.id);
						if (msg.type === "error") req.reject(new Error(msg.error));
						else req.resolve(msg.payload);
					}
				} else {
					for (const h of eventHandlers) {
						if (h.event === "*" || h.event === msg.type) {
							h.handler(msg);
						}
					}
				}
			} catch (_e) {
				// ignore malformed lines
			}
		}
	});

	socket.on("error", (err) => {
		for (const [, req] of pending) {
			req.reject(err);
		}
		pending.clear();
	});

	socket.on("close", () => {
		closed = true;
		for (const [, req] of pending) {
			req.reject(new Error("Socket closed"));
		}
		pending.clear();
	});

	const client: Client = {
		env() {
			return {
				sessionId: process.env.ADLER_SESSION,
				spanId: process.env.ADLER_SPAN_ID,
				socketPath: process.env.ADLER_SOCKET ?? SOCKET_PATH,
			};
		},
		session: {
			create: (data) => send("session.create", data),
			list: () => send("session.list", {}),
		},
		agent: {
			run: (data) => send("agent.run", data),
			wait: (data) => send("agent.wait", data),
			status: (data) => send("agent.status", data),
			list: () => send("agent.list", {}),
			attach: (nameOrId) => send("agent.attach", { span_id: nameOrId }),
		},
		span: {
			get: (id) => send("span.get", { id }),
			list: (sessionId) => send("span.list", { session_id: sessionId }),
			update: (id, data, options) => send("span.update", { id, data, options }),
		},
		context: {
			add: (data) => send("context.add", data),
			list: () => send("context.list", {}),
		},
		async subscribe(sessionId, handler) {
			const wrapped = (msg: unknown) => handler(msg as IpcMessage);
			const entry = { event: "*", handler: wrapped };
			eventHandlers.push(entry);
			try {
				const snapshot = await send("subscribe", { session_id: sessionId });
				if (
					snapshot &&
					typeof snapshot === "object" &&
					"type" in (snapshot as object) &&
					(snapshot as IpcMessage).type === "snapshot"
				) {
					wrapped(snapshot);
				}
			} catch (err) {
				eventHandlers = eventHandlers.filter((h) => h !== entry);
				throw err;
			}
			return () => {
				eventHandlers = eventHandlers.filter((h) => h !== entry);
			};
		},
		on(event, handler) {
			const entry = { event, handler };
			eventHandlers.push(entry);
			return () => {
				eventHandlers = eventHandlers.filter((h) => h !== entry);
			};
		},
		close() {
			closed = true;
			socket.end();
		},
	};

	return client;
}
