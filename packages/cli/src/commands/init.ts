import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Command } from "commander";

const CONFIG_TEMPLATE = `import type { AdlrConfig } from "@adlr/sdk"

const config: AdlrConfig = {
  agent: {
    agents: {
      // Example: echo: ({ prompt }) => \`echo "\${prompt}"\`,
    },
  },
}

export default config
`;

export const initCmd = new Command("init")
	.description("Initialize adlr in the current project")
	.action(async () => {
		const dir = join(process.cwd(), ".adlr");
		mkdirSync(dir, { recursive: true });
		const configPath = join(dir, "adlr.ts");
		if (existsSync(configPath)) {
			console.log("adlr.ts already exists");
			return;
		}
		writeFileSync(configPath, CONFIG_TEMPLATE, "utf-8");
		console.log(`Created ${configPath}`);
	});
