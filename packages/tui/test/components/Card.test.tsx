import { describe, test, expect } from "bun:test"
import React from "react"
import { render } from "ink-testing-library"
import { Card } from "../../src/components/Card"

describe("Card", () => {
  test("renders title and description", () => {
    const { lastFrame } = render(
      <Card title="test-agent" description="do something" status="running" />
    )
    expect(lastFrame()).toContain("test-agent")
    expect(lastFrame()).toContain("do something")
  })

  test("renders hint", () => {
    const { lastFrame } = render(
      <Card title="test" status="done" hint="press enter" />
    )
    expect(lastFrame()).toContain("press enter")
  })

  test("renders left border for status", () => {
    const { lastFrame } = render(
      <Card title="test" status="failed" />
    )
    expect(lastFrame()).toContain("┃")
  })
})
