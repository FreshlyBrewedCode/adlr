import type { AdlrClient } from "./types";

export class RootSpanResolver {
	private spanId: string | undefined;
	private creating: Promise<string> | undefined;

	constructor(
		private readonly sessionId: string,
		private readonly client: AdlrClient,
		managedSpanId?: string,
	) {
		this.spanId = managedSpanId;
	}

	async resolve(): Promise<string> {
		if (this.spanId) return this.spanId;
		if (this.creating) return this.creating;
		this.creating = this.client.span
			.create<"agent">({
				session_id: this.sessionId,
				kind: "agent",
				name: "opencode",
				status: "running",
			})
			.then((span) => {
				this.spanId = span.id;
				return span.id;
			});
		return this.creating;
	}
}
