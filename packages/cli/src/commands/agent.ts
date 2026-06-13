import { createClient } from "@adler/sdk"
import { ensureDaemon } from "../auto-start"
import { resolveSessionId } from "../resolve-session"
import { parseFlags } from "../parse-flags"

export async function run(args: string[], subcommand: string): Promise<void> {
  await ensureDaemon()
  const client = createClient()
  const sessionId = resolveSessionId({})
  if (!sessionId) {
    console.error("No active session. Run `adler new` first.")
    process.exit(1)
  }

  const flags = parseFlags(args)

  try {
    switch (subcommand) {
      case "run": {
        const prompt = flags._?.join(" ") ?? ""
        if (!prompt) {
          console.error("Usage: adler agent run --agent <type> [--name <name>] <prompt>")
          process.exit(1)
        }
        if (!flags.agent) {
          console.error("Usage: adler agent run --agent <type> [--name <name>] <prompt>")
          process.exit(1)
        }
        const span = await client.agent.run({
          sessionId,
          agentType: flags.agent,
          prompt,
          name: flags.name ?? `agent-${Date.now()}`,
          parentSpanId: client.env().spanId,
        })
        console.log(span.id)
        break
      }
      case "wait": {
        if (!flags.name) {
          console.error("Usage: adler agent wait --name <name>")
          process.exit(1)
        }
        const span = await client.agent.wait({ name: flags.name })
        console.log(span.status)
        break
      }
      case "status": {
        if (!flags.name) {
          console.error("Usage: adler agent status --name <name>")
          process.exit(1)
        }
        const status = await client.agent.status({ name: flags.name })
        console.log(status)
        break
      }
      case "list": {
        const spans = await client.agent.list()
        for (const span of spans) {
          console.log(`${span.id} ${span.name} ${span.status}`)
        }
        break
      }
      case "read": {
        if (!flags.name) {
          console.error("Usage: adler agent read --name <name>")
          process.exit(1)
        }
        const span = await client.agent.wait({ name: flags.name })
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
          // Attach to live PTY
          await client.agent.attach(flags.name)
        }
        break
      }
      default:
        console.error(`Unknown agent subcommand: ${subcommand}`)
        process.exit(1)
    }
  } finally {
    client.close()
  }
}
