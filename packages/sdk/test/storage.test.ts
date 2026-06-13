import { test, expect, describe, beforeEach, afterEach } from "bun:test"
import { SQLiteStorage } from "../src/sqlite-storage"

describe("SQLiteStorage", () => {
  let storage: SQLiteStorage

  beforeEach(() => {
    storage = new SQLiteStorage(":memory:")
  })

  afterEach(() => {
    storage.close()
  })

  test("createSession returns a session", async () => {
    const session = await storage.createSession({ working_dir: "/tmp/test" })
    expect(session.id).toBeString()
    expect(session.status).toBe("active")
    expect(session.working_dir).toBe("/tmp/test")
    expect(session.created_at).toBeNumber()
  })

  test("getSession returns null for missing id", async () => {
    const result = await storage.getSession("not-real")
    expect(result).toBeNull()
  })

  test("getSession returns correct session for existing", async () => {
    const session = await storage.createSession({ working_dir: "/tmp/test", status: "completed" })
    const result = await storage.getSession(session.id)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(session.id)
    expect(result!.status).toBe("completed")
    expect(result!.working_dir).toBe("/tmp/test")
    expect(result!.created_at).toBe(session.created_at)
  })

  test("listSessions returns all sessions", async () => {
    await storage.createSession({ working_dir: "/a" })
    await storage.createSession({ working_dir: "/b" })
    const sessions = await storage.listSessions()
    expect(sessions.length).toBe(2)
  })

  test("updateSession modifies status", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    await storage.updateSession(session.id, { status: "completed" })
    const updated = await storage.getSession(session.id)
    expect(updated!.status).toBe("completed")
  })

  test("createSpan and listSpans", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const span = await storage.createSpan({
      session_id: session.id,
      kind: "agent",
      name: "test-agent",
      data: { prompt: "hello" },
    })
    expect(span.status).toBe("pending")
    const spans = await storage.listSpans(session.id)
    expect(spans.length).toBe(1)
    expect(spans[0].name).toBe("test-agent")
  })

  test("createSpan with parent_id", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const parent = await storage.createSpan({ session_id: session.id, kind: "workflow", name: "parent" })
    const child = await storage.createSpan({
      session_id: session.id,
      parent_id: parent.id,
      kind: "step",
      name: "child",
    })
    expect(child.parent_id).toBe(parent.id)
    const spans = await storage.listSpans(session.id)
    expect(spans.length).toBe(2)
    const found = spans.find(s => s.id === child.id)
    expect(found!.parent_id).toBe(parent.id)
  })

  test("createSpan with explicit status", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const span = await storage.createSpan({
      session_id: session.id,
      kind: "agent",
      name: "test",
      status: "running",
    })
    expect(span.status).toBe("running")
    const found = await storage.getSpan(span.id)
    expect(found!.status).toBe("running")
  })

  test("updateSpan merges data", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const span = await storage.createSpan({ session_id: session.id, kind: "agent", name: "x" })
    await storage.updateSpan(span.id, { status: "done", finished_at: Date.now() })
    const updated = await storage.getSpan(span.id)
    expect(updated!.status).toBe("done")
    expect(updated!.finished_at).toBeNumber()
  })

  test("updateSpan JSON data round-trip", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const span = await storage.createSpan({ session_id: session.id, kind: "agent", name: "x" })
    await storage.updateSpan(span.id, { data: { key: "value", nested: { a: 1 } } })
    const updated = await storage.getSpan(span.id)
    expect(updated!.data).toEqual({ key: "value", nested: { a: 1 } })
  })

  test("getSpan returns null for missing id", async () => {
    const result = await storage.getSpan("not-real")
    expect(result).toBeNull()
  })

  test("getSpan returns correct span for existing", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const span = await storage.createSpan({ session_id: session.id, kind: "agent", name: "test", data: { x: 1 } })
    const result = await storage.getSpan(span.id)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(span.id)
    expect(result!.name).toBe("test")
    expect(result!.data).toEqual({ x: 1 })
  })

  test("createEvent and listEvents", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const event = await storage.createEvent({
      session_id: session.id,
      type: "log.info",
      data: { message: "hello" },
    })
    expect(event.id).toBeNumber()
    const events = await storage.listEvents(session.id)
    expect(events.length).toBe(1)
    expect(events[0].type).toBe("log.info")
  })

  test("createEvent with span_id and timestamp", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const span = await storage.createSpan({ session_id: session.id, kind: "agent", name: "test" })
    const event = await storage.createEvent({
      session_id: session.id,
      span_id: span.id,
      type: "log.info",
      data: { message: "hello" },
      timestamp: 12345,
    })
    expect(event.span_id).toBe(span.id)
    expect(event.timestamp).toBe(12345)
    const events = await storage.listEvents(session.id)
    expect(events.length).toBe(1)
    expect(events[0].span_id).toBe(span.id)
    expect(events[0].timestamp).toBe(12345)
  })

  test("listEvents with span_id filter", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const span = await storage.createSpan({ session_id: session.id, kind: "agent", name: "test" })
    await storage.createEvent({ session_id: session.id, type: "log.info", data: {} })
    await storage.createEvent({ session_id: session.id, span_id: span.id, type: "log.warn", data: {} })
    const events = await storage.listEvents(session.id, { span_id: span.id })
    expect(events.length).toBe(1)
    expect(events[0].type).toBe("log.warn")
  })

  test("addContextItem and listContextItems", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const item = await storage.addContextItem({
      session_id: session.id,
      type: "goal",
      value: { text: "Build feature" },
    })
    expect(item.type).toBe("goal")
    const items = await storage.listContextItems(session.id)
    expect(items.length).toBe(1)
  })

  test("listContextItems filter by type", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    await storage.addContextItem({ session_id: session.id, type: "goal", value: { text: "x" } })
    await storage.addContextItem({ session_id: session.id, type: "url", value: { url: "y" } })
    const items = await storage.listContextItems(session.id, { type: "goal" })
    expect(items.length).toBe(1)
    expect(items[0].type).toBe("goal")
  })

  test("listContextItems filter by label", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    await storage.addContextItem({ session_id: session.id, type: "goal", label: "alpha", value: { text: "x" } })
    await storage.addContextItem({ session_id: session.id, type: "goal", label: "beta", value: { text: "y" } })
    const items = await storage.listContextItems(session.id, { label: "alpha" })
    expect(items.length).toBe(1)
    expect(items[0].label).toBe("alpha")
  })

  test("listContextItems filter by empty label string", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    await storage.addContextItem({ session_id: session.id, type: "goal", label: "", value: { text: "x" } })
    await storage.addContextItem({ session_id: session.id, type: "goal", label: "beta", value: { text: "y" } })
    const items = await storage.listContextItems(session.id, { label: "" })
    expect(items.length).toBe(1)
    expect(items[0].label).toBe("")
  })

  test("listEvents filter by undefined type", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    await storage.createEvent({ session_id: session.id, type: "log.info", data: {} })
    const events = await storage.listEvents(session.id, { type: undefined })
    expect(events.length).toBe(1)
  })

  test("listAllSpans returns spans across all sessions", async () => {
    const sessionA = await storage.createSession({ working_dir: "/tmp/a" })
    const sessionB = await storage.createSession({ working_dir: "/tmp/b" })
    await storage.createSpan({ session_id: sessionA.id, kind: "agent", name: "agent-a" })
    await storage.createSpan({ session_id: sessionB.id, kind: "agent", name: "agent-b" })
    const spans = await storage.listAllSpans()
    expect(spans.length).toBe(2)
    const names = spans.map(s => s.name).sort()
    expect(names).toEqual(["agent-a", "agent-b"])
  })
})
