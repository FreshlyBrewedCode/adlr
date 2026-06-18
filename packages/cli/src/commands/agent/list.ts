import { createClient } from "@adler/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";

export const agentListCmd = new Command("list")
	.description("List all agents")
	.action(async () => {
		await ensureDaemon();
		const client = createClient();
		try {
			const spans = await client.agent.list();
			for (const span of spans) {
				console.log(`${span.id} ${span.name} ${span.status}`);
			}
		} finally {
			client.close();
		}
	});
