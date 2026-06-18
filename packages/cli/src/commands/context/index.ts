import { Command } from "commander";
import { contextAddCmd } from "./add";
import { contextGetCmd } from "./get";
import { contextListCmd } from "./list";

export const contextCmd = new Command("context")
	.description("Context management commands")
	.addCommand(contextAddCmd)
	.addCommand(contextListCmd)
	.addCommand(contextGetCmd);
