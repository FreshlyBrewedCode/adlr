import { createClient } from "@adler/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";
import { AdlerCliError } from "../../error";
import { resolveSessionId } from "../../resolve-session";

export const agentRunCmd = new Command("run")
	.description("Run an agent")
	.requiredOption("--agent <type>", "Agent type")
	.option("--name <name>", "Agent name")
	.option("--id <id>", "Agent ID (alias for --name)")
	.argument("<prompt>", "Prompt to send to the agent")
	.action(
		async (
			prompt: string,
			options: { agent: string; name?: string; id?: string },
		) => {
			await ensureDaemon();
			const client = createClient();
			try {
				const sessionId = resolveSessionId({
					session: agentRunCmd.optsWithGlobals().session,
				});
				if (!sessionId) {
					throw new AdlerCliError("No active session. Run `adler new` first.");
				}

				const agentName = options.name ?? options.id ?? `agent-${Date.now()}`;

				const span = await client.agent.run({
					sessionId,
					agentType: options.agent,
					prompt,
					name: agentName,
					parentSpanId: client.env().spanId,
				});
				console.log(span.id);
			} finally {
				client.close();
			}
		},
	);
