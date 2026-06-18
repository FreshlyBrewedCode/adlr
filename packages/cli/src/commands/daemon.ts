import { existsSync, readFileSync } from "node:fs";
import { PID_FILE } from "@adlr/sdk";
import { Command } from "commander";

export const daemonCmd = new Command("daemon")
	.description("Daemon management commands")
	.addCommand(
		new Command("stop").description("Stop the daemon").action(async () => {
			if (!existsSync(PID_FILE)) {
				console.log("Daemon is not running");
				return;
			}
			const raw = readFileSync(PID_FILE, "utf-8").trim();
			const pid = parseInt(raw, 10);
			if (Number.isNaN(pid)) {
				console.error("Corrupted PID file: not a valid number");
				return;
			}
			try {
				process.kill(pid, "SIGTERM");
				console.log("Daemon stopped");
			} catch {
				console.error("Failed to stop daemon");
			}
		}),
	);
