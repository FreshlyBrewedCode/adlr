import { createClient } from "@adler/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";

export const agentWaitCmd = new Command("wait")
	.description("Wait for an agent to finish")
	.option("--name <name>", "Agent name")
	.option("--id <id>", "Agent ID (alternative to --name)")
	.action(async (options: { name?: string; id?: string }) => {
		if (!options.name && !options.id) {
			console.error("Error: either --name or --id must be provided");
			process.exit(1);
		}
		await ensureDaemon();
		const client = createClient();
		try {
			const lookup = options.id
				? { id: options.id }
				: { name: options.name as string };
			const span = await client.agent.wait(lookup);
			console.log(span.status);
		} finally {
			client.close();
		}
	});
