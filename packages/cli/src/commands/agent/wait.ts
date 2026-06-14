import { Command } from "commander"
import { createClient } from "@adler/sdk"
import { ensureDaemon } from "../../auto-start"

export const agentWaitCmd = new Command("wait")
  .description("Wait for an agent to finish")
  .requiredOption("--name <name>", "Agent name")
  .action(async (options: { name: string }) => {
    await ensureDaemon()
    const client = createClient()
    try {
      const span = await client.agent.wait({ name: options.name })
      console.log(span.status)
    } finally {
      client.close()
    }
  })
