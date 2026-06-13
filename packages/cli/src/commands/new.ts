import { createClient } from "@adler/sdk"
import { writeFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { ensureDaemon } from "../auto-start"

export async function run(args: { goal?: string }): Promise<void> {
  await ensureDaemon()
  const client = createClient()

  try {
    const session = await client.session.create({
      working_dir: process.cwd(),
    })

    if (args.goal) {
      await client.context.add({
        session_id: session.id,
        type: "goal",
        value: { text: args.goal },
      })
    }

    const dir = join(process.cwd(), ".adler")
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, ".session"), session.id, "utf-8")

    console.log(`Created session ${session.id}`)
  } finally {
    client.close()
  }
}
