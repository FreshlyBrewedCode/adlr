import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	unlinkSync,
} from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { SQLiteStorage } from "@adlr/sdk";
import { ConfigLoader } from "../src/config-loader";
import { InactivityTimer } from "../src/lifecycle";
import { ProcessManager } from "../src/process-manager";
import { startServer } from "../src/server";

function createTestSocketPath(): { socketPath: string; tmpDir: string } {
	const tmpDir = mkdtempSync(join(tmpdir(), "adlr-daemon-test-"));
	return { socketPath: join(tmpDir, "adlr.sock"), tmpDir };
}

interface DaemonResponse {
	type: string;
	id: string;
	payload: unknown;
}

describe("Daemon server", () => {
	let storage: SQLiteStorage;
	let pm: ProcessManager;
	let server: ReturnType<typeof startServer>;
	let inactivity: InactivityTimer;
	let testSocketPath: string;
	let tmpDir: string;

	beforeEach(async () => {
		const socketPaths = createTestSocketPath();
		testSocketPath = socketPaths.socketPath;
		tmpDir = socketPaths.tmpDir;
		process.env.ADLR_SOCKET = testSocketPath;

		if (existsSync(testSocketPath)) unlinkSync(testSocketPath);
		const socketDir = dirname(testSocketPath);
		if (!existsSync(socketDir)) mkdirSync(socketDir, { recursive: true });

		storage = new SQLiteStorage(":memory:");
		pm = new ProcessManager(storage, new ConfigLoader(), () => {});
		inactivity = new InactivityTimer(() => {});
		server = startServer(
			storage,
			() => pm,
			inactivity,
			undefined,
			testSocketPath,
		);
		await new Promise((r) => setTimeout(r, 100));
	});

	afterEach(() => {
		server.close();
		pm.stop();
		inactivity.stop();
		storage.close();
		if (existsSync(testSocketPath)) unlinkSync(testSocketPath);
		rmSync(tmpDir, { recursive: true, force: true });
		delete process.env.ADLR_SOCKET;
	});

	test("session.create returns a session", async () => {
		const client = connect(testSocketPath);
		await new Promise<void>((resolve, reject) => {
			client.once("connect", resolve);
			client.once("error", reject);
		});

		const response = await new Promise<DaemonResponse>((resolve) => {
			let buffer = "";
			client.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				if (lines.length > 1) {
					for (const line of lines) {
						if (line) {
							resolve(JSON.parse(line));
							return;
						}
					}
				}
			});
			client.write(
				`${JSON.stringify({
					type: "session.create",
					id: "req-1",
					payload: { working_dir: "/tmp" },
				})}\n`,
			);
		});

		expect(response).toHaveProperty("type", "response");
		expect(response).toHaveProperty("payload");
		const payload = response.payload as Record<string, unknown>;
		expect(payload).toHaveProperty("id");
		expect(payload.status).toBe("active");
		client.end();
	});

	test("session.list excludes __daemon__ session", async () => {
		// Create the daemon sentinel session
		storage.upsertDaemonSession();

		// Create a normal session
		const client = connect(testSocketPath);
		await new Promise<void>((resolve, reject) => {
			client.once("connect", resolve);
			client.once("error", reject);
		});

		// Create a normal session
		const createResponse = await new Promise<DaemonResponse>((resolve) => {
			let buffer = "";
			client.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				if (lines.length > 1) {
					for (const line of lines) {
						if (line) {
							resolve(JSON.parse(line));
							return;
						}
					}
				}
			});
			client.write(
				`${JSON.stringify({
					type: "session.create",
					id: "req-create",
					payload: { working_dir: "/tmp" },
				})}\n`,
			);
		});
		const normalSessionId = (createResponse.payload as Record<string, unknown>)
			.id as string;

		// Now call session.list
		const listResponse = await new Promise<DaemonResponse>((resolve) => {
			let buffer = "";
			client.removeAllListeners("data");
			client.on("data", (data) => {
				buffer += data.toString();
				const lines = buffer.split("\n");
				if (lines.length > 1) {
					for (const line of lines) {
						if (line) {
							resolve(JSON.parse(line));
							return;
						}
					}
				}
			});
			client.write(
				`${JSON.stringify({ type: "session.list", id: "req-list", payload: {} })}\n`,
			);
		});

		const sessions = listResponse.payload as Array<{ id: string }>;
		const ids = sessions.map((s) => s.id);

		expect(ids).toContain(normalSessionId);
		expect(ids).not.toContain("__daemon__");

		client.end();
	});
});
