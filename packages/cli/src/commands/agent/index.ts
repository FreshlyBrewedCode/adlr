import { Command } from "commander";
import { agentListCmd } from "./list";
import { agentReadCmd } from "./read";
import { agentRunCmd } from "./run";
import { agentStatusCmd } from "./status";
import { agentWaitCmd } from "./wait";

export const agentCmd = new Command("agent")
	.description("Agent management commands")
	.addCommand(agentRunCmd)
	.addCommand(agentWaitCmd)
	.addCommand(agentStatusCmd)
	.addCommand(agentListCmd)
	.addCommand(agentReadCmd);
