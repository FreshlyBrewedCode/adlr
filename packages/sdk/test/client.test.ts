import { test, expect, describe, afterAll } from "bun:test"
import { createServer } from "net"
import { createClient } from "../src/client"

const FAKE_SOCK = "/tmp/fake.sock"

const server = createServer(() => {})
await new Promise<void>((resolve) => server.listen(FAKE_SOCK, () => resolve()))

afterAll(() => {
  server.close()
})

describe("Client", () => {
  test("env reads ADLER_SESSION and ADLER_SPAN_ID", () => {
    const oldSession = process.env.ADLER_SESSION
    const oldSpan = process.env.ADLER_SPAN_ID
    process.env.ADLER_SESSION = "sess-123"
    process.env.ADLER_SPAN_ID = "span-456"

    const client = createClient(FAKE_SOCK)
    const env = client.env()
    expect(env.sessionId).toBe("sess-123")
    expect(env.spanId).toBe("span-456")

    process.env.ADLER_SESSION = oldSession
    process.env.ADLER_SPAN_ID = oldSpan
    client.close()
  })

  test("client has all namespace methods", () => {
    const client = createClient(FAKE_SOCK)
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
