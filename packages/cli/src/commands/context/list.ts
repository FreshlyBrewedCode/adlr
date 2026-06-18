import { createClient } from "@adler/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";

export const contextListCmd = new Command("list")
	.description("List all context items")
	.action(async () => {
		await ensureDaemon();
		const client = createClient();
		try {
			const items = await client.context.list();
			for (const item of items) {
				console.log(
					`${item.type} ${item.label ?? ""} ${JSON.stringify(item.value)}`,
				);
			}
		} finally {
			client.close();
		}
	});
