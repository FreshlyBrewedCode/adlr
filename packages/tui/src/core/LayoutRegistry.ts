import type { LayoutDefinition } from "./types"

const layouts = new Map<string, LayoutDefinition>()

export const LayoutRegistry = {
  register(def: LayoutDefinition): void {
    if (layouts.has(def.id)) {
      throw new Error(`Layout already registered: ${def.id}`)
    }
    layouts.set(def.id, def)
  },

  get(id: string): LayoutDefinition | undefined {
    return layouts.get(id)
  },

  clear(): void {
    layouts.clear()
  }
}
