import { spawn } from "node:child_process";
import {
	closeSync,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	unlinkSync,
} from "node:fs";
import { connect } from "node:net";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { getAdlrDir, getSocketPath } from "@adlr/sdk";

const DAEMON_START_TIMEOUT_MS = 5000;
const DAEMON_POLL_INTERVAL_MS = 100;

async function canConnect(socketPath: string): Promise<boolean> {
	return new Promise((resolve) => {
		const socket = connect(socketPath);
		socket.on("connect", () => {
			socket.end();
			resolve(true);
		});
		socket.on("error", () => {
			resolve(false);
		});
	});
}

function getDaemonLogDetail(logPath: string): string {
	try {
		return readFileSync(logPath, "utf-8").trim();
	} catch {
		return "";
	}
}

export async function ensureDaemon(): Promise<void> {
	const socketPath = getSocketPath();

	if (existsSync(socketPath)) {
		if (await canConnect(socketPath)) {
			return;
		}
		unlinkSync(socketPath);
	}

	const adlrDir = getAdlrDir();
	mkdirSync(adlrDir, { recursive: true });
	const logPath = join(adlrDir, "daemon.stderr.log");
	const logFd = openSync(logPath, "w");

	const daemonPath = new URL("../../daemon/src/index.ts", import.meta.url)
		.pathname;
	const proc = spawn(process.execPath, [daemonPath], {
		detached: true,
		stdio: ["ignore", "ignore", logFd],
	});
	proc.unref();
	closeSync(logFd);

	let spawnError: Error | null = null;
	let exitCode: number | null = null;
	let exitSignal: string | null = null;

	proc.on("error", (err) => {
		spawnError = err;
	});

	proc.on("exit", (code, signal) => {
		if (code !== 0 && code !== null) {
			exitCode = code;
		} else if (signal) {
			exitSignal = signal;
		}
	});

	const start = Date.now();
	while (Date.now() - start < DAEMON_START_TIMEOUT_MS) {
		await setTimeout(DAEMON_POLL_INTERVAL_MS);

		if (spawnError) {
			throw spawnError;
		}
		if (exitCode !== null) {
			const detail = getDaemonLogDetail(logPath);
			const msg = detail
				? `Daemon exited with code ${exitCode}:\n${detail}`
				: `Daemon exited with code ${exitCode}`;
			throw new Error(msg);
		}
		if (exitSignal !== null) {
			const detail = getDaemonLogDetail(logPath);
			const msg = detail
				? `Daemon was killed by signal ${exitSignal}:\n${detail}`
				: `Daemon was killed by signal ${exitSignal}`;
			throw new Error(msg);
		}
		if (await canConnect(socketPath)) {
			return;
		}
	}
	const detail = getDaemonLogDetail(logPath);
	const msg = detail
		? `Daemon failed to start within 5 seconds:\n${detail}`
		: "Daemon failed to start within 5 seconds";
	throw new Error(msg);
}
