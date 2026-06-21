#!/usr/bin/env node
// Pretty-print log.jsonl as Markdown.
// Usage: node log2md.mjs [log.jsonl|-] [model] [agent]

import fs from "node:fs";

const file = process.argv[2] || "log.jsonl";
const model = process.argv[3] || "unknown model";
const agent = process.argv[4] || "unknown agent";

const content = file === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(file, "utf8");
const records = content
	.split("\n")
	.map((line) => line.trim())
	.filter(Boolean)
	.map((line) => JSON.parse(line));

const textRecords = records.filter((r) => r.type === "text");
const lastText = textRecords[textRecords.length - 1]?.part?.text || "";

const stepFinishes = records.filter((r) => r.type === "step_finish");
const totalCost = stepFinishes.reduce((sum, r) => sum + (r.part?.cost || 0), 0);

const firstTs = records[0]?.timestamp || 0;
const lastTs = records[records.length - 1]?.timestamp || firstTs;
const totalTimeMs = lastTs - firstTs;

function formatDuration(ms) {
	if (ms < 1000) return `${ms}ms`;
	if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
	const m = Math.floor(ms / 60000);
	const s = ((ms % 60000) / 1000).toFixed(1);
	return `${m}m ${s}s`;
}

function truncate(str, len = 1000) {
	if (!str) return "";
	if (str.length <= len) return str;
	return `${str.slice(0, len)}\n... (truncated)`;
}

function indent(text, spaces) {
	const prefix = " ".repeat(spaces);
	return text
		.split("\n")
		.map((line) => prefix + line)
		.join("\n");
}

function renderFullLog(items) {
	const out = [];
	for (const r of items) {
		if (r.type === "text") {
			out.push(r.part?.text || "");
			out.push("");
		} else if (r.type === "tool_use") {
			const tool = r.part?.tool || "tool";
			const input = JSON.stringify(r.part?.state?.input ?? null, null, 2);
			const output = r.part?.state?.output || "";

			out.push("<details>");
			out.push(`  <summary>${tool}</summary>`);
			out.push("");
			out.push("  Input:");
			out.push("  ```");
			out.push(indent(truncate(input), 2));
			out.push("  ```");
			out.push("");
			out.push("  Output:");
			out.push("  ```");
			out.push(indent(truncate(output), 2));
			out.push("  ```");
			out.push("");
			out.push("</details>");
			out.push("");
		}
	}
	return out.join("\n").trim();
}

const fullLog = renderFullLog(records);

const output = `${lastText}

<details>
  <summary>show full run (${formatDuration(totalTimeMs)}, $${totalCost.toFixed(2)})</summary>

  > ${model}, ${agent}

${indent(fullLog, 2)}

</details>
`;

console.log(output);
