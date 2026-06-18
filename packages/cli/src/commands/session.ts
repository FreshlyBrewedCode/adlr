import { createClient } from "@adlr/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../auto-start";

export const sessionCmd = new Command("session")
	.description("Session management commands")
	.addCommand(
		new Command("list").description("List all sessions").action(async () => {
			await ensureDaemon();
			const client = createClient();
			try {
				const sessions = await client.session.list();
				for (const s of sessions) {
					console.log(`${s.id} ${s.status} ${s.working_dir}`);
				}
			} finally {
				client.close();
			}
		}),
	);
