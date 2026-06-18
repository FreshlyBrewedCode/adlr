import { existsSync, type FSWatcher, watch } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AdlrConfig } from "@adlr/sdk";
import type { DaemonLogger } from "./logger";

const GLOBAL_CONFIG_STEMS = [join(homedir(), ".config/adlr/adlr.ts")];

function findConfigFile(candidates: string[]): string | null {
	return candidates.find(existsSync) ?? null;
}

function projectConfigCandidates(dir: string): string[] {
	return [join(dir, ".adlr/adlr.ts")];
}

export class ConfigLoader {
	private cache = new Map<string, AdlrConfig>();
	private watchers = new Map<string, FSWatcher>();

	constructor(private logger?: DaemonLogger) {}

	async loadConfig(dir: string): Promise<AdlrConfig> {
		const absDir = resolve(dir);
		const cached = this.cache.get(absDir);
		if (cached) {
			return cached;
		}

		const config = await this.resolveConfig(absDir);
		const files = [
			findConfigFile(GLOBAL_CONFIG_STEMS),
			findConfigFile(projectConfigCandidates(absDir)),
		].filter((f): f is string => f !== null);
		if (Object.keys(config).length === 0 && files.length === 0) {
			return config;
		}
		this.cache.set(absDir, config);
		this.watchConfig(absDir);
		return config;
	}

	private async resolveConfig(dir: string): Promise<AdlrConfig> {
		let globalConfig: AdlrConfig = {};
		let projectConfig: AdlrConfig = {};
		const globalPath = findConfigFile(GLOBAL_CONFIG_STEMS);
		const projectPath = findConfigFile(projectConfigCandidates(dir));

		if (globalPath) {
			try {
				const mod = await import(`${globalPath}?t=${Date.now()}`);
				globalConfig = mod.default ?? {};
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				console.error(`Failed to load global config ${globalPath}:`, error);
				this.logger?.warn("Failed to load global config", {
					path: globalPath,
					error,
				});
			}
		}

		if (projectPath) {
			try {
				const mod = await import(`${projectPath}?t=${Date.now()}`);
				projectConfig = mod.default ?? {};
			} catch (e) {
				const error = e instanceof Error ? e.message : String(e);
				console.error(`Failed to load project config ${projectPath}:`, error);
				this.logger?.warn("Failed to load project config", {
					path: projectPath,
					error,
				});
			}
		}

		this.logger?.info("Config loaded", {
			global_path: globalPath,
			project_path: projectPath,
		});

		return mergeConfig(globalConfig, projectConfig);
	}

	private watchConfig(dir: string): void {
		const absDir = resolve(dir);
		if (this.watchers.has(absDir)) return;

		const files = [
			findConfigFile(GLOBAL_CONFIG_STEMS),
			findConfigFile(projectConfigCandidates(dir)),
		].filter((f): f is string => f !== null);
		if (files.length === 0) return;

		const fileWatchers = files.map((file) =>
			watch(file, (_eventType, _filename) => {
				this.logger?.info("Config reloaded", { path: file });
				this.invalidate(absDir);
			}),
		);

		const watcher = {
			close: () => {
				for (const w of fileWatchers) w.close();
			},
		} as FSWatcher;

		this.watchers.set(absDir, watcher);
	}

	invalidate(dir: string): void {
		const absDir = resolve(dir);
		this.cache.delete(absDir);
		const watcher = this.watchers.get(absDir);
		if (watcher) {
			watcher.close();
			this.watchers.delete(absDir);
		}
	}

	close(): void {
		for (const watcher of this.watchers.values()) {
			watcher.close();
		}
		this.watchers.clear();
		this.cache.clear();
	}
}

function mergeConfig(base: AdlrConfig, override: AdlrConfig): AdlrConfig {
	const merged: AdlrConfig = {
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

	return merged;
}
