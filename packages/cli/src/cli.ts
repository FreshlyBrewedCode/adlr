import { Command } from "commander"
import { initCmd } from "./commands/init"
import { newCmd } from "./commands/new"
import { sessionCmd } from "./commands/session"
import { daemonCmd } from "./commands/daemon"
import { agentCmd } from "./commands/agent"
import { contextCmd } from "./commands/context"
import { AdlerCliError } from "./error"

export function buildCli(): Command {
  const program = new Command()
    .name("adler")
    .description("adler - Eagle eyes on your agents")
    .version("0.1.0")
    .option("-s, --session <id>", "Session ID override")
    .configureHelp({
      subcommandTerm: (cmd) => `${cmd.name()} ${cmd.usage() || ""}`.trim(),
    })

  program.addCommand(initCmd)
  program.addCommand(newCmd)
  program.addCommand(sessionCmd)
  program.addCommand(daemonCmd)
  program.addCommand(agentCmd)
  program.addCommand(contextCmd)

  return program
}

export async function runCli(argv: string[] = process.argv): Promise<void> {
  const program = buildCli()

  try {
    await program.parseAsync(argv)
  } catch (err) {
    if (err instanceof Error) {
      console.error(err.message)
    } else {
      console.error(err)
    }
    process.exit(1)
  }
}
