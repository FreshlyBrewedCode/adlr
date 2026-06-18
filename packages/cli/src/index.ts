#!/usr/bin/env bun
import { runTui } from "@adlr/tui";
import { ensureDaemon } from "./auto-start";
import { runCli } from "./cli";

async function main() {
	const args = process.argv.slice(2);

	if (args.length === 0) {
		// Launch TUI
		await ensureDaemon();
		try {
			await runTui();
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			console.error("TUI failed to start:", msg);
			process.exit(1);
		}
		return;
	}

	await runCli(process.argv);
}

main().catch((err) => {
	const msg = err instanceof Error ? err.message : String(err);
	console.error(msg);
	process.exit(1);
});
