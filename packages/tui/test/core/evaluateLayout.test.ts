import { describe, test, expect } from "bun:test"
import { evaluateLayout } from "../../src/core/evaluateLayout"

describe("evaluateLayout", () => {
  test("evaluates tabs layout with panels", () => {
    const tree = evaluateLayout(({ Layout, Panel }) =>
      Layout({ type: "tabs", children: [
        Panel({ id: "overview" })
      ]})
    )
    expect(tree.type).toBe("layout")
    expect(tree.layout).toBe("tabs")
    expect(tree.children[0].type).toBe("panel")
    expect(tree.children[0].id).toBe("overview")
  })

  test("evaluates split layout with ratio", () => {
    const tree = evaluateLayout(({ Layout, Panel }) =>
      Layout({ type: "split", ratio: 0.6, children: [
        Panel({ id: "agents" }),
        Panel({ id: "logs" })
      ]})
    )
    expect(tree.props.ratio).toBe(0.6)
    expect(tree.children.length).toBe(2)
  })
})
