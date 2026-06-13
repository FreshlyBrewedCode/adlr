import { writeFileSync, mkdirSync, existsSync } from "node:fs"
import { join } from "node:path"

const CONFIG_TEMPLATE = `import type { AdlerConfig } from "@adler/sdk"

const config: AdlerConfig = {
  agent: {
    agents: {
      // Example: echo: ({ prompt }) => \`echo "\${prompt}"\`,
    },
  },
}

export default config
`

export async function run(): Promise<void> {
  const dir = join(process.cwd(), ".adler")
  mkdirSync(dir, { recursive: true })
  const configPath = join(dir, "adler.ts")
  if (existsSync(configPath)) {
    console.log("adler.ts already exists")
    return
  }
  writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8")
  console.log(`Created ${configPath}`)
}
