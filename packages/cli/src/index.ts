import { ensureDaemon } from "./auto-start"
import { parseFlags } from "./parse-flags"

async function main(argv: string[] = process.argv.slice(2)) {
  if (argv.length === 0) {
    // Launch TUI
    await ensureDaemon()
    try {
      const { runTui } = await import("@adler/tui")
      await runTui()
    } catch (err) {
      console.error("TUI failed to start:", err)
      process.exit(1)
    }
    return
  }

  const command = argv[0]
  const subcommand = argv[1]
  const rest = argv.slice(2)

  switch (command) {
    case "new": {
      const { run } = await import("./commands/new")
      const flags = parseFlags(argv.slice(1))
      await run({ goal: flags.goal })
      break
    }
    case "agent": {
      const { run } = await import("./commands/agent")
      await run(rest, subcommand)
      break
    }
    case "context": {
      const { run } = await import("./commands/context")
      await run(rest, subcommand)
      break
    }
    case "session": {
      const { run } = await import("./commands/session")
      await run(subcommand)
      break
    }
    case "init": {
      const { run } = await import("./commands/init")
      await run()
      break
    }
    case "daemon": {
      const { run } = await import("./commands/daemon")
      await run(subcommand)
      break
    }
    default:
      console.error(`Unknown command: ${command}`)
      process.exit(1)
  }

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
