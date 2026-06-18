import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";

const CONFIG_TEMPLATE = `import type { AdlerConfig } from "@adler/sdk"

const config: AdlerConfig = {
  agent: {
    agents: {
      // Example: echo: ({ prompt }) => \`echo "\${prompt}"\`,
    },
  },
}

export default config
`;

export const initCmd = new Command("init")
	.description("Initialize adler in the current project")
	.action(async () => {
		const dir = join(process.cwd(), ".adler");
		mkdirSync(dir, { recursive: true });
		const configPath = join(dir, "adler.ts");
		if (existsSync(configPath)) {
			console.log("adler.ts already exists");
			return;
		}
		writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
		console.log(`Created ${configPath}`);
	});
