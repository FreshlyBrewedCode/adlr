import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@adler/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../auto-start";

export const newCmd = new Command("new")
	.description("Create a new session")
	.option("--goal <goal>", "Initial goal for the session")
	.action(async (options: { goal?: string }) => {
		await ensureDaemon();
		const client = createClient();

		try {
			const session = await client.session.create({
				working_dir: process.cwd(),
			});

			if (options.goal) {
				await client.context.add({
					session_id: session.id,
					type: "goal",
					value: { text: options.goal },
				});
			}

			const dir = join(process.cwd(), ".adler");
			mkdirSync(dir, { recursive: true });
			writeFileSync(join(dir, ".session"), session.id, "utf-8");

			console.log(`Created session ${session.id}`);
		} finally {
			client.close();
		}
	});
