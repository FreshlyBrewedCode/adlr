import { existsSync, watch, type FSWatcher } from "fs"
import { join, resolve } from "path"
import { homedir } from "os"
import type { AdlerConfig } from "@adler/sdk"

const GLOBAL_CONFIG = join(homedir(), ".config/adler/adler.ts")

export class ConfigLoader {
  private cache = new Map<string, AdlerConfig>()
  private watchers = new Map<string, FSWatcher>()

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

    if (existsSync(GLOBAL_CONFIG)) {
      try {
        const mod = await import(`${GLOBAL_CONFIG}?t=${Date.now()}`)
        globalConfig = mod.default ?? {}
      } catch (e) {
        console.error(`Failed to load global config ${GLOBAL_CONFIG}:`, e instanceof Error ? e.message : String(e))
      }
    }

    const projectConfigPath = join(dir, ".adler/adler.ts")
    if (existsSync(projectConfigPath)) {
      try {
        const mod = await import(`${projectConfigPath}?t=${Date.now()}`)
        projectConfig = mod.default ?? {}
      } catch (e) {
        console.error(`Failed to load project config ${projectConfigPath}:`, e instanceof Error ? e.message : String(e))
      }
    }

    return mergeConfig(globalConfig, projectConfig)
  }

  private watchConfig(dir: string): void {
    const absDir = resolve(dir)
    if (this.watchers.has(absDir)) return

    const files = [GLOBAL_CONFIG, join(dir, ".adler/adler.ts")].filter(existsSync)
    if (files.length === 0) return

    const fileWatchers = files.map((file) =>
      watch(file, (eventType, filename) => {
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
