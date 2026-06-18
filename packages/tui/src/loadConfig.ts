import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AdlerConfig } from "@adler/sdk";

const GLOBAL_CONFIG_PATH = join(homedir(), ".config/adler/adler.ts");

function findConfig(candidates: string[]): string | null {
	return candidates.find(existsSync) ?? null;
}

function projectConfigCandidates(dir: string): string[] {
	return [join(dir, ".adler/adler.ts")];
}

export async function loadConfig(dir: string): Promise<AdlerConfig> {
	const absDir = resolve(dir);
	const globalPath = findConfig([GLOBAL_CONFIG_PATH]);
	const projectPath = findConfig(projectConfigCandidates(absDir));

	let globalConfig: AdlerConfig = {};
	let projectConfig: AdlerConfig = {};

	if (globalPath) {
		try {
			const mod = await import(`${globalPath}?t=${Date.now()}`);
			globalConfig = mod.default ?? {};
		} catch {
			// ignore global config errors
		}
	}

	if (projectPath) {
		try {
			const mod = await import(`${projectPath}?t=${Date.now()}`);
			projectConfig = mod.default ?? {};
		} catch {
			// ignore project config errors
		}
	}

	return mergeConfig(globalConfig, projectConfig);
}

function mergeConfig(base: AdlerConfig, override: AdlerConfig): AdlerConfig {
	const merged: AdlerConfig = {
		...base,
		...override,
	};

	const agents = { ...base.agent?.agents, ...override.agent?.agents };
	const attach = override.agent?.attach ?? base.agent?.attach;

	if (Object.keys(agents).length > 0 || attach !== undefined) {
		merged.agent = {
			...base.agent,
			...override.agent,
			agents,
			attach,
		};
	}

	// Merge TUI config: override takes precedence
	if (base.tui || override.tui) {
		merged.tui = {
			...base.tui,
			...override.tui,
		};
	}

	return merged;
}
