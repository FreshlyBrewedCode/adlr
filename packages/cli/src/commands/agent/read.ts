import { createClient } from "@adlr/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";

export const agentReadCmd = new Command("read")
	.description("Read agent output")
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
			if (span.data?.output) {
				const output = span.data.output as {
					type: string;
					content?: string;
					path?: string;
				};
				if (output.type === "text" && output.content) {
					console.log(output.content);
				} else if (output.type === "file" && output.path) {
					console.log(`File output: ${output.path}`);
				} else {
					console.log("Unknown output type");
				}
			} else {
				await client.agent.attach(options.id ?? (options.name as string));
			}
		} finally {
			client.close();
		}
	});
