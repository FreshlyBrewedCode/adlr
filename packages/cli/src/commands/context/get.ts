import { createClient } from "@adlr/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";

export const contextGetCmd = new Command("get")
	.description("Get context items by filter")
	.option("--type <type>", "Filter by type")
	.option("--label <label>", "Filter by label")
	.action(async (options: { type?: string; label?: string }) => {
		await ensureDaemon();
		const client = createClient();
		try {
			const items = await client.context.list();
			const filtered = items.filter((i) => {
				if (options.type && i.type !== options.type) return false;
				if (options.label && i.label !== options.label) return false;
				return true;
			});
			for (const item of filtered) {
				console.log(JSON.stringify(item.value));
			}
		} finally {
			client.close();
		}
	});
