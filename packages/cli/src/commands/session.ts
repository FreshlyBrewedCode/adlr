import { createClient } from "@adler/sdk"
import { ensureDaemon } from "../auto-start"

export async function run(subcommand: string): Promise<void> {
  await ensureDaemon()
  const client = createClient()

  try {
    switch (subcommand) {
      case "list": {
        const sessions = await client.session.list()
        for (const s of sessions) {
          console.log(`${s.id} ${s.status} ${s.working_dir}`)
        }
        break
      }
      default:
        console.error(`Unknown session subcommand: ${subcommand}`)
        process.exit(1)
    }
  } finally {
    client.close()
  }
}
