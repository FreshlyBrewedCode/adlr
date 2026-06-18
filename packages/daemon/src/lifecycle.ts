import {
	existsSync,
	mkdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { ADLR_DIR, PID_FILE, SOCKET_PATH } from "@adlr/sdk";

const INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function ensureAdlerDir(): void {
	if (!existsSync(ADLR_DIR)) {
		mkdirSync(ADLR_DIR, { recursive: true });
	}
}

export function writePid(): void {
	ensureAdlerDir();
	writeFileSync(PID_FILE, String(process.pid), "utf-8");
}

export function readPid(): number | null {
	if (!existsSync(PID_FILE)) return null;
	try {
		return parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10);
	} catch {
		return null;
	}
}

export function removePid(): void {
	try {
		unlinkSync(PID_FILE);
	} catch {}
}

export function removeSocket(): void {
	try {
		unlinkSync(SOCKET_PATH);
	} catch {}
}

export function isDaemonRunning(): boolean {
	const pid = readPid();
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export class InactivityTimer {
	private timer: ReturnType<typeof setTimeout> | null = null;
	private clientCount: number = 0;
	private runningAgents: number = 0;

	constructor(private onShutdown: () => void | Promise<void>) {}

	touch(): void {
		this.reset();
	}

	addClient(): void {
		this.clientCount++;
		this.check();
	}

	removeClient(): void {
		this.clientCount = Math.max(0, this.clientCount - 1);
		this.check();
	}

	addAgent(): void {
		this.runningAgents++;
		this.check();
	}

	removeAgent(): void {
		this.runningAgents = Math.max(0, this.runningAgents - 1);
		this.check();
	}

	private check(): void {
		if (this.clientCount === 0 && this.runningAgents === 0) {
			this.reset();
		} else {
			this.clear();
		}
	}

	private reset(): void {
		this.clear();
		this.timer = setTimeout(async () => {
			await this.onShutdown();
		}, INACTIVITY_TIMEOUT_MS);
	}

	private clear(): void {
		if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}

	stop(): void {
		this.clear();
	}
}
