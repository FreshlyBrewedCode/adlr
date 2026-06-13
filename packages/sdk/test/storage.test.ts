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

  test("updateSpan merges data", async () => {
    const session = await storage.createSession({ working_dir: "/tmp" })
    const span = await storage.createSpan({ session_id: session.id, kind: "agent", name: "x" })
    await storage.updateSpan(span.id, { status: "done", finished_at: Date.now() })
    const updated = await storage.getSpan(span.id)
    expect(updated!.status).toBe("done")
    expect(updated!.finished_at).toBeNumber()
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
})
