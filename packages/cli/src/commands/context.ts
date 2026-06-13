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
      case "add": {
        if (!flags.type) {
          console.error("Usage: adler context add --type <type> [--label <label>] [--description <description>] <value>")
          process.exit(1)
        }
        const value = flags._?.[0] ?? ""
        let parsedValue: Record<string, unknown>
        try {
          parsedValue = JSON.parse(value)
        } catch {
          parsedValue = { text: value }
        }
        const item = await client.context.add({
          session_id: sessionId,
          type: flags.type as import("@adler/sdk").ContextItemType,
          label: flags.label ?? null,
          description: flags.description ?? null,
          value: parsedValue,
        })
        console.log(`Added context item ${item.id}`)
        break
      }
      case "list": {
        const items = await client.context.list()
        for (const item of items) {
          console.log(`${item.type} ${item.label ?? ""} ${JSON.stringify(item.value)}`)
        }
        break
      }
      case "get": {
        const items = await client.context.list()
        const filtered = items.filter(i => {
          if (flags.type && i.type !== flags.type) return false
          if (flags.label && i.label !== flags.label) return false
          return true
        })
        for (const item of filtered) {
          console.log(JSON.stringify(item.value))
        }
        break
      }
      default:
        console.error(`Unknown context subcommand: ${subcommand}`)
        process.exit(1)
    }
  } finally {
    client.close()
  }
}
