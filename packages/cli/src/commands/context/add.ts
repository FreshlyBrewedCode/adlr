import { createClient } from "@adler/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";
import { AdlerCliError } from "../../error";
import { resolveSessionId } from "../../resolve-session";

export const contextAddCmd = new Command("add")
	.description("Add a context item")
	.requiredOption("--type <type>", "Context item type")
	.option("--label <label>", "Label")
	.option("--description <description>", "Description")
	.argument("<value>", "Value to add")
	.action(
		async (
			value: string,
			options: { type: string; label?: string; description?: string },
		) => {
			await ensureDaemon();
			const client = createClient();
			const sessionId = resolveSessionId({
				session: contextAddCmd.optsWithGlobals().session,
			});
			if (!sessionId) {
				throw new AdlerCliError("No active session. Run `adler new` first.");
			}

			let parsedValue: Record<string, unknown>;
			try {
				parsedValue = JSON.parse(value);
			} catch {
				parsedValue = { text: value };
			}

			try {
				const item = await client.context.add({
					session_id: sessionId,
					type: options.type as import("@adler/sdk").ContextItemType,
					label: options.label ?? null,
					description: options.description ?? null,
					value: parsedValue,
				});
				console.log(`Added context item ${item.id}`);
			} finally {
				client.close();
			}
		},
	);
