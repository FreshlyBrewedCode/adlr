import { existsSync, watch, type FSWatcher } from "fs"
import { join, resolve } from "path"
import { homedir } from "os"
import type { AdlerConfig } from "@adler/sdk"
import type { DaemonLogger } from "./logger"

const GLOBAL_CONFIG = join(homedir(), ".config/adler/adler.ts")

export class ConfigLoader {
  private cache = new Map<string, AdlerConfig>()
  private watchers = new Map<string, FSWatcher>()

  constructor(private logger?: DaemonLogger) {}

  async loadConfig(dir: string): Promise<AdlerConfig> {
    const absDir = resolve(dir)
    const cached = this.cache.get(absDir)
    if (cached) {
      return cached
    }

    const config = await this.resolveConfig(absDir)
    const files = [GLOBAL_CONFIG, join(absDir, ".adler/adler.ts")].filter(existsSync)
    if (Object.keys(config).length === 0 && files.length === 0) {
      return config
    }
    this.cache.set(absDir, config)
    this.watchConfig(absDir)
    return config
  }

  private async resolveConfig(dir: string): Promise<AdlerConfig> {
    let globalConfig: AdlerConfig = {}
    let projectConfig: AdlerConfig = {}
    const globalPath = existsSync(GLOBAL_CONFIG) ? GLOBAL_CONFIG : null
    const projectConfigPath = join(dir, ".adler/adler.ts")
    const projectPath = existsSync(projectConfigPath) ? projectConfigPath : null

    if (globalPath) {
      try {
        const mod = await import(`${globalPath}?t=${Date.now()}`)
        globalConfig = mod.default ?? {}
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        console.error(`Failed to load global config ${globalPath}:`, error)
        this.logger?.warn("Failed to load global config", { path: globalPath, error })
      }
    }

    if (projectPath) {
      try {
        const mod = await import(`${projectPath}?t=${Date.now()}`)
        projectConfig = mod.default ?? {}
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e)
        console.error(`Failed to load project config ${projectPath}:`, error)
        this.logger?.warn("Failed to load project config", { path: projectPath, error })
      }
    }

    this.logger?.info("Config loaded", {
      global_path: globalPath,
      project_path: projectPath,
    })

    return mergeConfig(globalConfig, projectConfig)
  }

  private watchConfig(dir: string): void {
    const absDir = resolve(dir)
    if (this.watchers.has(absDir)) return

    const files = [GLOBAL_CONFIG, join(dir, ".adler/adler.ts")].filter(existsSync)
    if (files.length === 0) return

    const fileWatchers = files.map((file) =>
      watch(file, (_eventType, _filename) => {
        this.logger?.info("Config reloaded", { path: file })
        this.invalidate(absDir)
      })
    )

    const watcher = {
      close: () => {
        fileWatchers.forEach((w) => w.close())
      },
    } as FSWatcher

    this.watchers.set(absDir, watcher)
  }

  invalidate(dir: string): void {
    const absDir = resolve(dir)
    this.cache.delete(absDir)
    const watcher = this.watchers.get(absDir)
    if (watcher) {
      watcher.close()
      this.watchers.delete(absDir)
    }
  }

  close(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close()
    }
    this.watchers.clear()
    this.cache.clear()
  }
}

function mergeConfig(base: AdlerConfig, override: AdlerConfig): AdlerConfig {
  const merged: AdlerConfig = {
    ...base,
    ...override,
  }

  const agents = { ...base.agent?.agents, ...override.agent?.agents }
  const attach = override.agent?.attach ?? base.agent?.attach

  if (Object.keys(agents).length > 0 || attach !== undefined) {
    merged.agent = {
      ...base.agent,
      ...override.agent,
      agents,
      attach,
    }
  }

  return merged
}
