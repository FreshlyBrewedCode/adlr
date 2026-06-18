import { Command } from "commander";
import { spanGetCmd } from "./get";
import { spanListCmd } from "./list";

export const spanCmd = new Command("span")
	.description("Span inspection commands")
	.addCommand(spanListCmd)
	.addCommand(spanGetCmd);
