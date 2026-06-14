import { Command } from "commander"
import { createClient } from "@adler/sdk"
import { ensureDaemon } from "../../auto-start"
import { resolveSessionId } from "../../resolve-session"
import { AdlerCliError } from "../../error"

export const agentRunCmd = new Command("run")
  .description("Run an agent")
  .requiredOption("--agent <type>", "Agent type")
  .option("--name <name>", "Agent name")
  .argument("<prompt>", "Prompt to send to the agent")
  .action(async (prompt: string, options: { agent: string; name?: string }) => {
    await ensureDaemon()
    const client = createClient()
    try {
      const sessionId = resolveSessionId({ session: agentRunCmd.optsWithGlobals().session })
      if (!sessionId) {
        throw new AdlerCliError("No active session. Run `adler new` first.")
      }

      const span = await client.agent.run({
        sessionId,
        agentType: options.agent,
        prompt,
        name: options.name ?? `agent-${Date.now()}`,
        parentSpanId: client.env().spanId,
      })
      console.log(span.id)
    } finally {
      client.close()
    }
  })
