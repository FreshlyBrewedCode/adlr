import { describe, test, expect, beforeEach } from "bun:test"
import { LayoutRegistry } from "../../src/core/LayoutRegistry"
import type { LayoutDefinition } from "../../src/core/types"

describe("LayoutRegistry", () => {
  beforeEach(() => {
    LayoutRegistry.clear()
  })

  test("register and get layout", () => {
    const layout: LayoutDefinition = { id: "test", component: () => null }
    LayoutRegistry.register(layout)
    expect(LayoutRegistry.get("test")).toBe(layout)
  })

  test("duplicate id throws", () => {
    LayoutRegistry.register({ id: "dup", component: () => null })
    expect(() => {
      LayoutRegistry.register({ id: "dup", component: () => null })
    }).toThrow("Layout already registered: dup")
  })

  test("get returns undefined for unknown id", () => {
    expect(LayoutRegistry.get("unknown")).toBeUndefined()
  })
})
