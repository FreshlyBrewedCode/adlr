import { Command } from "commander"
import { agentRunCmd } from "./run"
import { agentWaitCmd } from "./wait"
import { agentStatusCmd } from "./status"
import { agentListCmd } from "./list"
import { agentReadCmd } from "./read"

export const agentCmd = new Command("agent")
  .description("Agent management commands")
  .addCommand(agentRunCmd)
  .addCommand(agentWaitCmd)
  .addCommand(agentStatusCmd)
  .addCommand(agentListCmd)
  .addCommand(agentReadCmd)
