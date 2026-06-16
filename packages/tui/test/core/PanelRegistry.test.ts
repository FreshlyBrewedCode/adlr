import { describe, test, expect } from "bun:test"
import { PanelRegistry } from "../../src/core/PanelRegistry"
import type { PanelDefinition } from "../../src/core/types"

describe("PanelRegistry", () => {
  test("register and get panel", () => {
    const panel: PanelDefinition = { id: "test", title: "Test", component: () => null }
    PanelRegistry.register(panel)
    expect(PanelRegistry.get("test")).toBe(panel)
  })

  test("getAll returns all panels", () => {
    PanelRegistry.register({ id: "a", title: "A", component: () => null })
    PanelRegistry.register({ id: "b", title: "B", component: () => null })
    const all = PanelRegistry.getAll()
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  test("duplicate id throws", () => {
    PanelRegistry.register({ id: "dup", title: "Dup", component: () => null })
    expect(() => {
      PanelRegistry.register({ id: "dup", title: "Dup2", component: () => null })
    }).toThrow()
  })
})
