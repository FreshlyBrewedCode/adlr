---
name: using-adlr-subagents
description: Use when orchestrating work via the adlr CLI, spawning non-blocking subagents, waiting for their results, or coordinating multiple parallel agents within an adlr session
---

# Using Adlr Subagents

## Overview

Adlr is an agent orchestrator with a CLI, daemon, and TUI dashboard. It manages sessions that track agents, context, logs, and workflow state. Agents are spawned non-blocking and tracked by name so you can wait for them and read their output when ready.

**Core principle:** Spawn agents non-blocking, coordinate with `wait`, retrieve results with `read`.

**Project root:** `bun run adlr` invokes the CLI from the repo root.

## Prerequisites

An active session is required before running agents.

```bash
# Check for an active session
adlr session list
# or check .adlr/.session for session id

# Create a session if needed
adlr new
adlr new --goal "Implement payment feature"
```

Session is auto-resolved from (highest to lowest priority):
1. `--session <id>` flag
2. `ADLR_SESSION` env var
3. `.adlr/.session` file

## Core Commands

### Spawn a non-blocking agent

```bash
adlr agent run \
  --agent <agent-type> \
  --name <unique-name> \
  "<prompt>"
```

- `--agent`: agent type, e.g. `opencode:build`, `opencode:plan`, `echo`
- `--name`: unique identifier used to reference this agent later (auto-generated if omitted)
- Returns the span ID immediately — the agent runs in the background

```bash
# Example: run a planning agent non-blocking
adlr agent run --agent opencode:plan --name "planner" "Research and create an implementation plan for the auth feature"
```

### Block until agent finishes

```bash
adlr agent wait --name <name>
# Outputs: the agent's final status (e.g. "completed", "failed")
```

### Read agent output

```bash
adlr agent read --name <name>
# Outputs: agent's text output, or file path if output was written to a file
```

### Check agent status (non-blocking)

```bash
adlr agent status --name <name>
# Returns current status without blocking
```

### List all agents in session

```bash
adlr agent list
# Outputs: id, name, status for each agent
```

## Parallel Agent Coordination

The key pattern: spawn all independent agents first, then wait and read in order.

```bash
# 1. Spawn multiple agents (all non-blocking)
adlr agent run --agent opencode:build --name "auth-impl" "Implement JWT authentication"
adlr agent run --agent opencode:build --name "db-schema" "Create database schema for users table"
adlr agent run --agent opencode:build --name "api-routes" "Add REST API routes for auth endpoints"

# 2. Wait for each to complete
adlr agent wait --name "auth-impl"
adlr agent wait --name "db-schema"
adlr agent wait --name "api-routes"

# 3. Read outputs
adlr agent read --name "auth-impl"
adlr agent read --name "db-schema"
adlr agent read --name "api-routes"
```

**When agents can run in parallel:** independent domains, no shared state, no file conflicts.

**When to serialize:** agents that depend on each other's output, or that edit overlapping files.

## Environment Variables Passed to Agents

Every agent spawned via `adlr agent run` automatically receives:

| Variable | Value |
|----------|-------|
| `ADLR_SESSION` | Current session ID |
| `ADLR_AGENT_PROMPT` | The prompt passed to the agent |
| `ADLR_CONTEXT` | JSON dump of all session context items |

Agents can use `ADLR_SESSION` to call back into adlr (e.g., to add context or log).

## Configuring Agent Types

Agent types are defined in `adlr.ts` (project: `.adlr/adlr.ts`, global: `~/.config/adlr/adlr.ts`):

```ts
const config: AdlrConfig = {
  agent: {
    agents: {
      // Simple: returns a shell command string
      echo: ({ prompt }) => `echo ${prompt}`,

      // Realistic: run opencode with a specific subagent
      opencode: ({ prompt, subagent }) =>
        `opencode run --agent ${subagent} "${prompt}"`,
    }
  }
}
```

Call with colon notation: `--agent opencode:build` passes `subagent="build"` to the factory.

Use the `@adlr/opencode` plugin for pre-built opencode agent definitions:

```ts
const config: AdlrConfig = {
  plugins: ["@adlr/opencode"],
}
```

## When to Use vs. Other Approaches

```dot
digraph when_to_use {
    "Running inside an adlr session?" [shape=diamond];
    "Multiple independent tasks?" [shape=diamond];
    "Need cross-session coordination?" [shape=diamond];
    "Use adlr agent run (parallel)" [shape=box];
    "Use adlr agent run (serial)" [shape=box];
    "Use dispatching-parallel-agents skill directly" [shape=box];
    "Use adlr assistant for auto-orchestration" [shape=box];

    "Running inside an adlr session?" -> "Multiple independent tasks?" [label="yes"];
    "Running inside an adlr session?" -> "Use dispatching-parallel-agents skill directly" [label="no"];
    "Multiple independent tasks?" -> "Use adlr agent run (parallel)" [label="yes, no file conflicts"];
    "Multiple independent tasks?" -> "Use adlr agent run (serial)" [label="no or shared files"];
    "Need cross-session coordination?" -> "Use adlr assistant for auto-orchestration" [label="yes"];
}
```

| Situation | Use |
|-----------|-----|
| Inside adlr session, tasks independent | `adlr agent run` (parallel, then wait) |
| Inside adlr session, tasks dependent | `adlr agent run` (serial, wait between) |
| No adlr session, tasks independent | `dispatching-parallel-agents` skill |
| Need full auto-orchestration | `adlr assistant --auto` |
| Need session observability/TUI | adlr (this skill) |

## Quick Reference

```bash
# Session setup
adlr new                                  # Create session
adlr new --goal "Build X"                 # Session with goal
adlr session list                         # List sessions

# Agent lifecycle
adlr agent run --agent <type> --name <n> "<prompt>"  # Spawn (non-blocking)
adlr agent wait --name <name>             # Block until done
adlr agent read --name <name>             # Get output
adlr agent status --name <name>           # Check status (non-blocking)
adlr agent list                           # List all agents

# Context
adlr context add --type url --label "docs" https://example.com
adlr context add --type file --label "spec" ./spec.md
adlr context list

# Workflows
adlr run my-workflow                      # Run defined workflow

# Assistant
adlr assistant "what happened so far?"    # Query session
adlr assistant --auto "finish workflow"   # Auto-orchestrate
```

## Common Mistakes

**Forgetting `--name`:** Without a name, auto-generated names make it hard to `wait` and `read` later. Always provide `--name` when you need to reference the agent.

**Spawning dependent agents in parallel:** If agent B needs agent A's output, spawn A, `wait`, `read`, then spawn B with A's output embedded in the prompt.

**No active session:** `adlr agent run` requires an active session. If it errors, run `adlr new` first.

**File conflicts in parallel agents:** Agents editing the same files simultaneously cause conflicts. Serialize agents that touch overlapping code paths.

**Not reading output after wait:** `wait` only blocks and returns status. Call `read` separately to get the actual output content.

## Red Flags

- Calling `adlr agent wait` before `adlr agent run` — nothing to wait for
- Running parallel agents that edit the same files — causes merge conflicts
- Skipping `--name` on agents you need to reference — use auto-generated IDs only if you don't need to wait/read
- Embedding large outputs in follow-up prompts without summarizing — keep agent context lean
