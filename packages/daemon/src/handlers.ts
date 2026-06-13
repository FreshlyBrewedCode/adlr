import type { Storage } from "@adler/sdk"
import type { ProcessManager } from "./process-manager"

export interface HandlerContext {
  storage: Storage
  processManager: ProcessManager
  subscribers: Map<string, Set<{ write: (data: string) => void }>>
  broadcast: (sessionId: string, event: { type: string; payload: unknown }) => void
}

export async function handleCommand(ctx: HandlerContext, type: string, payload: unknown): Promise<unknown> {
  switch (type) {
    case "session.create": {
      const data = payload as { working_dir?: string; status?: string }
      const session = await ctx.storage.createSession({
        working_dir: data.working_dir ?? process.cwd(),
        status: data.status as any,
      })
      ctx.broadcast(session.id, { type: "session.created", payload: { session_id: session.id } })
      return session
    }

    case "session.list": {
      return ctx.storage.listSessions()
    }

    case "session.get": {
      const { id } = payload as { id: string }
      return ctx.storage.getSession(id)
    }

    case "agent.run": {
      const data = payload as {
        session_id: string
        agent_type: string
        prompt: string
        name: string
        parent_span_id?: string | null
      }
      const span = await ctx.processManager.spawnAgent({
        sessionId: data.session_id,
        agentType: data.agent_type,
        prompt: data.prompt,
        name: data.name,
        parentSpanId: data.parent_span_id,
      })
      return span
    }

    case "agent.wait": {
      const { name } = payload as { name: string }
      const spans = await ctx.storage.listAllSpans()
      const span = spans.find(s => s.name === name)
      if (!span) throw new Error(`Agent not found: ${name}`)
      while (true) {
        const current = await ctx.storage.getSpan(span.id)
        if (!current) throw new Error("Span disappeared")
        if (current.status === "done" || current.status === "failed" || current.status === "blocked") {
          return current
        }
        await new Promise(r => setTimeout(r, 500))
      }
    }

    case "agent.status": {
      const { name } = payload as { name: string }
      const spans = await ctx.storage.listAllSpans()
      const span = spans.find(s => s.name === name)
      if (!span) throw new Error(`Agent not found: ${name}`)
      return span.status
    }

    case "agent.list": {
      const { session_id } = payload as { session_id: string }
      const spans = await ctx.storage.listSpans(session_id)
      return spans.filter(s => s.kind === "agent")
    }

    case "agent.attach": {
      const { span_id } = payload as { span_id: string }
      return { span_id, message: "Use raw socket for attach" }
    }

    case "span.update": {
      const { id, data, options } = payload as { id: string; data: Record<string, unknown>; options?: { merge?: boolean } }
      const existing = await ctx.storage.getSpan(id)
      if (!existing) throw new Error(`Span not found: ${id}`)
      const updatedData = options?.merge ? { ...existing.data, ...data } : data
      await ctx.storage.updateSpan(id, { data: updatedData })
      return { success: true }
    }

    case "context.add": {
      const data = payload as { session_id: string; type: string; label?: string; description?: string; value: Record<string, unknown> }
      const item = await ctx.storage.addContextItem({
        session_id: data.session_id,
        type: data.type as any,
        label: data.label ?? null,
        description: data.description ?? null,
        value: data.value,
      })
      ctx.broadcast(data.session_id, { type: "context.added", payload: { item_id: item.id, type: item.type, label: item.label } })
      return item
    }

    case "context.list": {
      const { session_id } = payload as { session_id: string }
      return ctx.storage.listContextItems(session_id)
    }

    case "subscribe": {
      const { session_id } = payload as { session_id: string }
      const session = await ctx.storage.getSession(session_id)
      if (!session) throw new Error(`Session not found: ${session_id}`)
      const spans = await ctx.storage.listSpans(session_id)
      const events = await ctx.storage.listEvents(session_id)
      const context = await ctx.storage.listContextItems(session_id)
      return {
        type: "snapshot",
        payload: { session, spans, events, context },
      }
    }

    default:
      throw new Error(`Unknown command: ${type}`)
  }
}
