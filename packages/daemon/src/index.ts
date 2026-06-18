import { DB_PATH, SQLiteStorage } from "@adlr/sdk";
import { ConfigLoader } from "./config-loader";
import {
	ensureAdlerDir,
	InactivityTimer,
	isDaemonRunning,
	removePid,
	removeSocket,
	writePid,
} from "./lifecycle";
import { createLogger } from "./logger";
import { ProcessManager } from "./process-manager";
import { startServer } from "./server";

async function main() {
	if (isDaemonRunning()) {
		console.error("Daemon is already running");
		process.exit(1);
	}

	ensureAdlerDir();

	const storage = new SQLiteStorage(DB_PATH);
	const logger = createLogger(storage);
	const configLoader = new ConfigLoader(logger);

	const inactivity = new InactivityTimer(async () => {
		await logger.info("Shutting down due to inactivity");
		shutdown();
	});

	let processManager: ProcessManager;

	const server = startServer(storage, () => processManager, inactivity, logger);

	processManager = new ProcessManager(
		storage,
		configLoader,
		(event) => {
			const payload = event.payload as Record<string, unknown> | undefined;
			const sessionId = payload?.session_id as string | undefined;
			if (sessionId) {
				server.broadcast(sessionId, event);
			}
		},
		inactivity,
		logger,
	);

	writePid();

	function shutdown() {
		server.close();
		processManager.stop();
		inactivity.stop();
		storage.close();
		configLoader.close();
		removePid();
		removeSocket();
		process.exit(0);
	}

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);

	await logger.info("adlrd started");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
