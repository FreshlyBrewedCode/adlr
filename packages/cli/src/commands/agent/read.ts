import { Command } from "commander"
import { createClient } from "@adler/sdk"
import { ensureDaemon } from "../../auto-start"

export const agentReadCmd = new Command("read")
  .description("Read agent output")
  .requiredOption("--name <name>", "Agent name")
  .action(async (options: { name: string }) => {
    await ensureDaemon()
    const client = createClient()
    try {
      const span = await client.agent.wait({ name: options.name })
      if (span.data?.output) {
        const output = span.data.output as { type: string; content?: string; path?: string }
        if (output.type === "text" && output.content) {
          console.log(output.content)
        } else if (output.type === "file" && output.path) {
          console.log(`File output: ${output.path}`)
        } else {
          console.log("Unknown output type")
        }
      } else {
        await client.agent.attach(options.name)
      }
    } finally {
      client.close()
    }
  })
