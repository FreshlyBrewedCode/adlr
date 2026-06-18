import type { Storage } from "@adlr/sdk";
import { DAEMON_SESSION_ID } from "@adlr/sdk";

export type StorageWithDaemonSession = Storage & {
	upsertDaemonSession(): void;
};

export type LogContext = {
	session_id?: string;
	span_id?: string | null;
};

export type DaemonLogger = {
	info(
		message: string,
		data?: Record<string, unknown>,
		ctx?: LogContext,
	): Promise<void>;
	warn(
		message: string,
		data?: Record<string, unknown>,
		ctx?: LogContext,
	): Promise<void>;
	error(
		message: string,
		data?: Record<string, unknown>,
		ctx?: LogContext,
	): Promise<void>;
};

export function createLogger(storage: StorageWithDaemonSession): DaemonLogger {
	let sentinelReady = false;

	function ensureSentinel(): void {
		if (sentinelReady) return;
		storage.upsertDaemonSession();
		sentinelReady = true;
	}

	async function write(
		level: "log.info" | "log.warn" | "log.error",
		message: string,
		data?: Record<string, unknown>,
		ctx?: LogContext,
	): Promise<void> {
		const sessionId = ctx?.session_id ?? DAEMON_SESSION_ID;
		const spanId = ctx?.span_id ?? null;

		if (sessionId === DAEMON_SESSION_ID) {
			ensureSentinel();
		}

		await storage.createEvent({
			session_id: sessionId,
			span_id: spanId,
			type: level,
			data: { message, ...data },
		});
	}

	return {
		info(message, data, ctx) {
			console.log(`[INFO] ${message}`, data ?? "");
			return write("log.info", message, data, ctx);
		},
		warn(message, data, ctx) {
			console.log(`[WARN] ${message}`, data ?? "");
			return write("log.warn", message, data, ctx);
		},
		error(message, data, ctx) {
			console.error(`[ERROR] ${message}`, data ?? "");
			return write("log.error", message, data, ctx);
		},
	};
}
