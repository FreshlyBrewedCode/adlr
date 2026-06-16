import { describe, test, expect, beforeEach } from "bun:test"
import { PanelRegistry } from "../../src/core/PanelRegistry"
import type { PanelDefinition } from "../../src/core/types"

describe("PanelRegistry", () => {
  beforeEach(() => PanelRegistry.clear())

  test("register and get panel", () => {
    const panel: PanelDefinition = { id: "test", title: "Test", component: () => null }
    PanelRegistry.register(panel)
    expect(PanelRegistry.get("test")).toBe(panel)
  })

  test("getAll returns all panels", () => {
    PanelRegistry.register({ id: "a", title: "A", component: () => null })
    PanelRegistry.register({ id: "b", title: "B", component: () => null })
    const all = PanelRegistry.getAll()
    expect(all).toHaveLength(2)
    expect(all.map(p => p.id)).toEqual(["a", "b"])
  })

  test("get returns undefined for unknown id", () => {
    expect(PanelRegistry.get("unknown-id")).toBeUndefined()
  })

  test("duplicate id overwrites", () => {
    const first = { id: "dup", title: "Dup", component: () => null }
    const second = { id: "dup", title: "Dup2", component: () => null }
    PanelRegistry.register(first)
    PanelRegistry.register(second)
    expect(PanelRegistry.get("dup")).toBe(second)
  })
})
