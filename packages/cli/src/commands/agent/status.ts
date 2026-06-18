import { createClient } from "@adler/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";

export const agentStatusCmd = new Command("status")
	.description("Get agent status")
	.requiredOption("--name <name>", "Agent name")
	.action(async (options: { name: string }) => {
		await ensureDaemon();
		const client = createClient();
		try {
			const status = await client.agent.status({ name: options.name });
			console.log(status);
		} finally {
			client.close();
		}
	});
