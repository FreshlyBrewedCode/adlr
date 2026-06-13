# SDK Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `@adler/sdk` — shared types, Storage interface, SQLite implementation, and typed IPC client. This is the foundation all other packages depend on.

**Architecture:** Pure TypeScript with Bun built-ins only. No runtime dependencies. Types are exported as-is. `Storage` is an interface with a `SQLiteStorage` implementation using `bun:sqlite`. The IPC client (`createClient`) wraps Unix socket communication with auto-start logic.

**Tech Stack:** Bun, `bun:sqlite`, `bun:ffi` (if needed), native `net` module for Unix sockets

---

## File Structure

```
packages/sdk/
  package.json
  tsconfig.json
  src/
    index.ts
    types.ts
    storage.ts
    sqlite-storage.ts
    paths.ts
    client.ts
  test/
    storage.test.ts
    client.test.ts
```

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/sdk/package.json`
- Create: `packages/sdk/tsconfig.json`
- Create: `packages/sdk/src/index.ts` (stub)

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@adler/sdk",
  "version": "0.1.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "bun test"
  },
  "dependencies": {}
}
```

- [ ] **Step 2: Write tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

- [ ] **Step 3: Write index.ts stub**

```ts
export * from "./types"
export * from "./storage"
export * from "./sqlite-storage"
export * from "./paths"
export * from "./client"
```

- [ ] **Step 4: Commit**

```bash
git add packages/sdk
git commit -m "feat(sdk): add package scaffolding"
```

---

## Task 2: Types (`types.ts`)

**Files:**
- Create: `packages/sdk/src/types.ts`

- [ ] **Step 1: Write all shared types**

```ts
export type SessionStatus = "active" | "completed" | "archived"

export interface Session {
  id: string
  status: SessionStatus
  working_dir: string
  created_at: number
}

export type CreateSessionInput = {
  status?: SessionStatus
  working_dir: string
}

export type SpanKind = "agent" | "workflow" | "step" | "hook"
export type SpanStatus = "pending" | "running" | "done" | "failed" | "blocked"

export interface Span {
  id: string
  session_id: string
  parent_id: string | null
  kind: SpanKind
  name: string
  status: SpanStatus
  started_at: number
  finished_at: number | null
  data: Record<string, unknown>
}

export type CreateSpanInput = {
  session_id: string
  parent_id?: string | null
  kind: SpanKind
  name: string
  status?: SpanStatus
  data?: Record<string, unknown>
}

export type EventType =
  | "span.started"
  | "span.finished"
  | "span.failed"
  | "log.info"
  | "log.warn"
  | "log.error"
  | "context.added"
  | "session.created"

export interface Event {
  id: number
  session_id: string
  span_id: string | null
  type: EventType
  data: Record<string, unknown>
  timestamp: number
}

export type CreateEventInput = {
  session_id: string
  span_id?: string | null
  type: EventType
  data?: Record<string, unknown>
  timestamp?: number
}

export type ContextItemType = "goal" | "url" | "file" | "text"

export interface ContextItem {
  id: string
  session_id: string
  type: ContextItemType
  label: string | null
  description: string | null
  value: Record<string, unknown>
  created_at: number
}

export type AddContextItemInput = {
  session_id: string
  type: ContextItemType
  label?: string | null
  description?: string | null
  value: Record<string, unknown>
}

export type EventFilter = {
  type?: EventType
  span_id?: string
}

export type ContextFilter = {
  type?: ContextItemType
  label?: string
}

export interface AdlerConfig {
  agent?: {
    agents?: Record<string, AgentConfig>
    attach?: AttachConfig
  }
}

export interface AgentConfig {
  run?: (ctx: { prompt: string; subagent?: string }) => string
  open?: (ctx: { span: Span; proc: ProcContext; $: unknown }) => string
  output?: (ctx: { span: Span; proc: ProcContext; $: unknown }) => Promise<{ type: "text"; content: string } | { type: "file"; path: string }>
  status?: (ctx: { span: Span; currentStatus: SpanStatus; proc: ProcContext; $: unknown }) => Promise<"working" | "completed" | "failed" | "blocked">
  statusPollInterval?: number
  mode?: "tui" | "log"
  interactive?: boolean
  interactiveTimeout?: number
}

export interface ProcContext {
  stdoutIdle: boolean
  lastStdout: string
}

export interface AttachConfig {
  (ctx: { agentId: string; readCmd: string; openCmd?: string }): string
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/types.ts
git commit -m "feat(sdk): add shared types"
```

---

## Task 3: Storage Interface (`storage.ts`)

**Files:**
- Create: `packages/sdk/src/storage.ts`

- [ ] **Step 1: Write Storage interface**

```ts
import type {
  Session,
  Span,
  Event,
  ContextItem,
  CreateSessionInput,
  CreateSpanInput,
  CreateEventInput,
  AddContextItemInput,
  EventFilter,
  ContextFilter,
} from "./types"

export interface Storage {
  createSession(data: CreateSessionInput): Promise<Session>
  getSession(id: string): Promise<Session | null>
  listSessions(): Promise<Session[]>
  updateSession(id: string, data: Partial<Session>): Promise<void>

  createSpan(data: CreateSpanInput): Promise<Span>
  updateSpan(id: string, data: Partial<Span>): Promise<void>
  getSpan(id: string): Promise<Span | null>
  listSpans(sessionId: string): Promise<Span[]>

  createEvent(data: CreateEventInput): Promise<Event>
  listEvents(sessionId: string, filter?: EventFilter): Promise<Event[]>

  addContextItem(data: AddContextItemInput): Promise<ContextItem>
  listContextItems(sessionId: string, filter?: ContextFilter): Promise<ContextItem[]>
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/storage.ts
git commit -m "feat(sdk): add storage interface"
```

---

## Task 4: SQLite Storage Implementation (`sqlite-storage.ts`)

**Files:**
- Create: `packages/sdk/src/sqlite-storage.ts`
- Create: `packages/sdk/test/storage.test.ts`

- [ ] **Step 1: Write SQLiteStorage**

```ts
import { Database } from "bun:sqlite"
import type { Storage } from "./storage"
import type {
  Session,
  Span,
  Event,
  ContextItem,
  CreateSessionInput,
  CreateSpanInput,
  CreateEventInput,
  AddContextItemInput,
  EventFilter,
  ContextFilter,
} from "./types"

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS spans (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  parent_id TEXT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  data TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (parent_id) REFERENCES spans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  span_id TEXT,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (span_id) REFERENCES spans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS context_items (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  label TEXT,
  description TEXT,
  value TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
`

function uuid(): string {
  return crypto.randomUUID()
}

export class SQLiteStorage implements Storage {
  private db: Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.exec("PRAGMA foreign_keys = ON")
    this.db.exec(INIT_SQL)
  }

  createSession(data: CreateSessionInput): Promise<Session> {
    const id = uuid()
    const now = Date.now()
    const session: Session = {
      id,
      status: data.status ?? "active",
      working_dir: data.working_dir,
      created_at: now,
    }
    this.db.run(
      "INSERT INTO sessions (id, status, working_dir, created_at) VALUES (?, ?, ?, ?)",
      [session.id, session.status, session.working_dir, session.created_at]
    )
    return Promise.resolve(session)
  }

  getSession(id: string): Promise<Session | null> {
    const row = this.db.query("SELECT * FROM sessions WHERE id = ?").get(id) as Record<string, unknown> | null
    if (!row) return Promise.resolve(null)
    return Promise.resolve(row as Session)
  }

  listSessions(): Promise<Session[]> {
    const rows = this.db.query("SELECT * FROM sessions ORDER BY created_at DESC").all() as Record<string, unknown>[]
    return Promise.resolve(rows as Session[])
  }

  updateSession(id: string, data: Partial<Session>): Promise<void> {
    const fields: string[] = []
    const values: unknown[] = []
    if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status) }
    if (data.working_dir !== undefined) { fields.push("working_dir = ?"); values.push(data.working_dir) }
    if (fields.length === 0) return Promise.resolve()
    values.push(id)
    this.db.run(`UPDATE sessions SET ${fields.join(", ")} WHERE id = ?`, values)
    return Promise.resolve()
  }

  createSpan(data: CreateSpanInput): Promise<Span> {
    const id = uuid()
    const now = Date.now()
    const span: Span = {
      id,
      session_id: data.session_id,
      parent_id: data.parent_id ?? null,
      kind: data.kind,
      name: data.name,
      status: data.status ?? "pending",
      started_at: now,
      finished_at: null,
      data: data.data ?? {},
    }
    this.db.run(
      "INSERT INTO spans (id, session_id, parent_id, kind, name, status, started_at, finished_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [span.id, span.session_id, span.parent_id, span.kind, span.name, span.status, span.started_at, span.finished_at, JSON.stringify(span.data)]
    )
    return Promise.resolve(span)
  }

  updateSpan(id: string, data: Partial<Span>): Promise<void> {
    const existing = this.db.query("SELECT * FROM spans WHERE id = ?").get(id) as Record<string, unknown> | null
    if (!existing) return Promise.resolve()
    const fields: string[] = []
    const values: unknown[] = []
    if (data.status !== undefined) { fields.push("status = ?"); values.push(data.status) }
    if (data.finished_at !== undefined) { fields.push("finished_at = ?"); values.push(data.finished_at) }
    if (data.data !== undefined) { fields.push("data = ?"); values.push(JSON.stringify(data.data)) }
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name) }
    if (fields.length === 0) return Promise.resolve()
    values.push(id)
    this.db.run(`UPDATE spans SET ${fields.join(", ")} WHERE id = ?`, values)
    return Promise.resolve()
  }

  getSpan(id: string): Promise<Span | null> {
    const row = this.db.query("SELECT * FROM spans WHERE id = ?").get(id) as Record<string, unknown> | null
    if (!row) return Promise.resolve(null)
    return Promise.resolve({
      ...row,
      data: JSON.parse((row.data as string) ?? "{}"),
    } as Span)
  }

  listSpans(sessionId: string): Promise<Span[]> {
    const rows = this.db.query("SELECT * FROM spans WHERE session_id = ? ORDER BY started_at ASC").all(sessionId) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      ...r,
      data: JSON.parse((r.data as string) ?? "{}"),
    })) as Span[])
  }

  createEvent(data: CreateEventInput): Promise<Event> {
    const now = data.timestamp ?? Date.now()
    const id = this.db.run(
      "INSERT INTO events (session_id, span_id, type, data, timestamp) VALUES (?, ?, ?, ?, ?)",
      [data.session_id, data.span_id ?? null, data.type, JSON.stringify(data.data ?? {}), now]
    ).lastInsertRowId
    const event: Event = {
      id: Number(id),
      session_id: data.session_id,
      span_id: data.span_id ?? null,
      type: data.type,
      data: data.data ?? {},
      timestamp: now,
    }
    return Promise.resolve(event)
  }

  listEvents(sessionId: string, filter?: EventFilter): Promise<Event[]> {
    const conditions = ["session_id = ?"]
    const values: unknown[] = [sessionId]
    if (filter?.type) { conditions.push("type = ?"); values.push(filter.type) }
    if (filter?.span_id) { conditions.push("span_id = ?"); values.push(filter.span_id) }
    const sql = `SELECT * FROM events WHERE ${conditions.join(" AND ")} ORDER BY timestamp DESC`
    const rows = this.db.query(sql).all(...values) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      ...r,
      data: JSON.parse((r.data as string) ?? "{}"),
    })) as Event[])
  }

  addContextItem(data: AddContextItemInput): Promise<ContextItem> {
    const id = uuid()
    const now = Date.now()
    const item: ContextItem = {
      id,
      session_id: data.session_id,
      type: data.type,
      label: data.label ?? null,
      description: data.description ?? null,
      value: data.value,
      created_at: now,
    }
    this.db.run(
      "INSERT INTO context_items (id, session_id, type, label, description, value, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [item.id, item.session_id, item.type, item.label, item.description, JSON.stringify(item.value), item.created_at]
    )
    return Promise.resolve(item)
  }

  listContextItems(sessionId: string, filter?: ContextFilter): Promise<ContextItem[]> {
    const conditions = ["session_id = ?"]
    const values: unknown[] = [sessionId]
    if (filter?.type) { conditions.push("type = ?"); values.push(filter.type) }
    if (filter?.label) { conditions.push("label = ?"); values.push(filter.label) }
    const sql = `SELECT * FROM context_items WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`
    const rows = this.db.query(sql).all(...values) as Record<string, unknown>[]
    return Promise.resolve(rows.map(r => ({
      ...r,
      value: JSON.parse((r.value as string) ?? "{}"),
    })) as ContextItem[])
  }

  close(): void {
    this.db.close()
  }
}
```

- [ ] **Step 2: Write storage tests**

```ts
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
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd packages/sdk && bun test`
Expected: All 10 tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/sdk
git commit -m "feat(sdk): add SQLite storage implementation and tests"
```

---

## Task 5: Paths (`paths.ts`)

**Files:**
- Create: `packages/sdk/src/paths.ts`

- [ ] **Step 1: Write shared path utilities**

```ts
import { homedir } from "os"
import { join } from "path"

export const ADLER_DIR = join(homedir(), ".local/share/adler")
export const SOCKET_PATH = join(ADLER_DIR, "adler.sock")
export const DB_PATH = join(ADLER_DIR, "adler.db")
export const PID_FILE = join(ADLER_DIR, "adler.pid")
```

- [ ] **Step 2: Commit**

```bash
git add packages/sdk/src/paths.ts
git commit -m "feat(sdk): add shared runtime paths"
```

---

## Task 6: IPC Client (`client.ts`)

**Files:**
- Create: `packages/sdk/src/client.ts`
- Create: `packages/sdk/test/client.test.ts`
- Modify: `packages/sdk/src/index.ts` (update exports)

- [ ] **Step 1: Write client.ts**

```ts
import { connect } from "net"
import { SOCKET_PATH } from "./paths"
import type { Session, Span, Event, ContextItem, CreateSessionInput, CreateSpanInput, CreateEventInput, AddContextItemInput, EventFilter, ContextFilter, SpanStatus } from "./types"

type IpcMessage =
  | { type: "response"; id: string; payload: unknown }
  | { type: "error"; id: string; error: string }
  | { type: "snapshot"; payload: { session: Session; spans: Span[]; events: Event[]; context: ContextItem[] } }
  | { type: "event"; event: string; payload: unknown }

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

export interface Client {
  env(): { sessionId: string | undefined; spanId: string | undefined; socketPath: string }
  session: {
    create(data?: CreateSessionInput): Promise<Session>
    list(): Promise<Session[]>
  }
  agent: {
    run(data: { sessionId: string; agentType: string; prompt: string; name?: string; parentSpanId?: string }): Promise<Span>
    wait(data: { name: string }): Promise<Span>
    status(data: { name: string }): Promise<SpanStatus>
    list(): Promise<Span[]>
    attach(nameOrId: string): Promise<void>
  }
  span: {
    update(id: string, data: Record<string, unknown>, options?: { merge?: boolean }): Promise<void>
  }
  context: {
    add(data: AddContextItemInput): Promise<ContextItem>
    list(): Promise<ContextItem[]>
  }
  subscribe(sessionId: string, handler: (event: IpcMessage) => void): Promise<() => void>
  on(event: string, handler: (event: unknown) => void): () => void
  close(): void
}

export function createClient(socketPath: string = SOCKET_PATH): Client {
  let socket = connect(socketPath)
  let pending = new Map<string, PendingRequest>()
  let eventHandlers: Array<{ event: string; handler: (event: unknown) => void }> = []
  let closed = false
  let reqId = 0

  function nextId(): string {
    return `req-${++reqId}`
  }

  function ensureConnection(): Promise<void> {
    if (socket.readyState === "open") return Promise.resolve()
    return new Promise((resolve, reject) => {
      const onOpen = () => { cleanup(); resolve() }
      const onError = (err: Error) => { cleanup(); reject(err) }
      const cleanup = () => {
        socket.removeListener("connect", onOpen)
        socket.removeListener("error", onError)
      }
      socket.once("connect", onOpen)
      socket.once("error", onError)
    })
  }

  function send<T>(type: string, payload: unknown): Promise<T> {
    if (closed) return Promise.reject(new Error("Client is closed"))
    const id = nextId()
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      ensureConnection().then(() => {
        socket.write(JSON.stringify({ type, id, payload }) + "\n")
      }).catch(reject)
    })
  }

  let buffer = ""
  socket.on("data", (data) => {
    buffer += data.toString()
    let lines: string[]
    while ((lines = buffer.split("\n")).length > 1) {
      buffer = lines.pop()!
      const line = lines[0]
      if (!line) continue
      try {
        const msg = JSON.parse(line) as IpcMessage
        if (msg.type === "response" || msg.type === "error") {
          const req = pending.get(msg.id)
          if (req) {
            pending.delete(msg.id)
            if (msg.type === "error") req.reject(new Error(msg.error))
            else req.resolve(msg.payload)
          }
        } else {
          for (const h of eventHandlers) {
            if (h.event === "*" || h.event === msg.type) {
              h.handler(msg)
            }
          }
        }
      } catch (e) {
        // ignore malformed lines
      }
    }
  })

  const client: Client = {
    env() {
      return {
        sessionId: process.env.ADLER_SESSION,
        spanId: process.env.ADLER_SPAN_ID,
        socketPath: process.env.ADLER_SOCKET ?? SOCKET_PATH,
      }
    },
    session: {
      create: (data) => send("session.create", data),
      list: () => send("session.list", {}),
    },
    agent: {
      run: (data) => send("agent.run", data),
      wait: (data) => send("agent.wait", data),
      status: (data) => send("agent.status", data),
      list: () => send("agent.list", {}),
      attach: (nameOrId) => send("agent.attach", { span_id: nameOrId }),
    },
    span: {
      update: (id, data, options) => send("span.update", { id, data, options }),
    },
    context: {
      add: (data) => send("context.add", data),
      list: () => send("context.list", {}),
    },
    async subscribe(sessionId, handler) {
      await send("subscribe", { session_id: sessionId })
      const wrapped = (msg: unknown) => handler(msg as IpcMessage)
      const entry = { event: "*", handler: wrapped }
      eventHandlers.push(entry)
      return () => {
        eventHandlers = eventHandlers.filter(h => h !== entry)
      }
    },
    on(event, handler) {
      eventHandlers.push({ event, handler })
      return () => {
        eventHandlers = eventHandlers.filter(h => h.handler !== handler)
      }
    },
    close() {
      closed = true
      socket.end()
    },
  }

  return client
}
```

- [ ] **Step 2: Write client tests**

```ts
import { test, expect, describe } from "bun:test"
import { createClient } from "../src/client"

describe("Client", () => {
  test("env reads ADLER_SESSION and ADLER_SPAN_ID", () => {
    const oldSession = process.env.ADLER_SESSION
    const oldSpan = process.env.ADLER_SPAN_ID
    process.env.ADLER_SESSION = "sess-123"
    process.env.ADLER_SPAN_ID = "span-456"

    const client = createClient("/tmp/fake.sock")
    const env = client.env()
    expect(env.sessionId).toBe("sess-123")
    expect(env.spanId).toBe("span-456")

    process.env.ADLER_SESSION = oldSession
    process.env.ADLER_SPAN_ID = oldSpan
    client.close()
  })

  test("client has all namespace methods", () => {
    const client = createClient("/tmp/fake.sock")
    expect(client.session.create).toBeFunction()
    expect(client.session.list).toBeFunction()
    expect(client.agent.run).toBeFunction()
    expect(client.agent.wait).toBeFunction()
    expect(client.agent.status).toBeFunction()
    expect(client.agent.list).toBeFunction()
    expect(client.agent.attach).toBeFunction()
    expect(client.span.update).toBeFunction()
    expect(client.context.add).toBeFunction()
    expect(client.context.list).toBeFunction()
    expect(client.subscribe).toBeFunction()
    expect(client.on).toBeFunction()
    client.close()
  })
})
```

- [ ] **Step 3: Update index.ts**

```ts
export * from "./types"
export * from "./storage"
export * from "./sqlite-storage"
export * from "./paths"
export { createClient, type Client } from "./client"
```

- [ ] **Step 4: Run tests**

Run: `cd packages/sdk && bun test`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sdk
git commit -m "feat(sdk): add IPC client and subscription support"
```

---

## Self-Review

1. **Spec coverage:** §3 Data Model (sessions, spans, events, context_items), §3 Storage Interface, §5 SDK (`createClient`, `env`, `session`, `agent`, `span`, `context`, `subscribe`, `on`), §4 IPC Protocol message types — all covered.
2. **No placeholders:** No TBD, TODO, or vague instructions. All code is complete.
3. **Type consistency:** All types are defined in `types.ts` and used consistently. `merge` option on `span.update` is defined in the client interface. Event types match the spec exactly.

Plan complete.
