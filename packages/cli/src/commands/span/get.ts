import { createClient } from "@adler/sdk";
import { Command } from "commander";
import { ensureDaemon } from "../../auto-start";

export const spanGetCmd = new Command("get")
	.description("Get a span by ID")
	.argument("<id>", "Span ID (full or prefix)")
	.option("--json", "Output as JSON")
	.action(async (id: string, options: { json?: boolean }) => {
		await ensureDaemon();
		const client = createClient();
		try {
			const span = await client.span.get(id);
			if (options.json) {
				console.log(JSON.stringify(span, null, 2));
			} else {
				console.log(`id:         ${span.id}`);
				console.log(`name:       ${span.name}`);
				console.log(`kind:       ${span.kind}`);
				console.log(`status:     ${span.status}`);
				console.log(`session_id: ${span.session_id}`);
				console.log(`parent_id:  ${span.parent_id ?? "(none)"}`);
				console.log(`started_at: ${new Date(span.started_at).toISOString()}`);
				console.log(
					`finished_at:${span.finished_at ? new Date(span.finished_at).toISOString() : "(running)"}`,
				);
				console.log(`data:       ${JSON.stringify(span.data, null, 2)}`);
			}
		} finally {
			client.close();
		}
	});
