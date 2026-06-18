import type { AdlrConfig } from "@adlr/sdk"

const config: AdlrConfig = {
  agent: {
    agents: {
      // Non-interactive: runs opencode headlessly, exits when done
      opencode: {
        run: ({ prompt }) => `opencode run ${JSON.stringify(prompt)}`,
        mode: "log",
        output: async (ctx) => ({ type: "text", content: ctx.proc.lastStdout }),
      },

      // Interactive TUI: opens the full opencode TUI
      "opencode-tui": {
        run: ({ prompt }) => `opencode --prompt ${JSON.stringify(prompt)}`,
        mode: "tui",
        interactive: true,
        interactiveTimeout: 10000,
      },
      test: {
        run: ({ prompt }) => `sleep 5 && echo ${JSON.stringify(prompt)}`,
        output: async (ctx) => ({ type: "text", content: ctx.proc.lastStdout }),
        mode: "log",
        interactive: false
      },
      "test-nested": {
        run: ({ prompt }) => `sleep 1 && bun run adlr agent run --agent test --name subagent hello && sleep 6`,
        mode: "log",
        interactive: false
      }
    },
  },
  // tui: {
  //   layout: {
  //     layout: "split",
  //     content: [
  //       "overview", "context", "agents"
  //     ]
  //   }
  // }
}

export default config
