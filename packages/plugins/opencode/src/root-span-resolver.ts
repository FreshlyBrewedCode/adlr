import type { AdlrClient } from "./types";

export class RootSpanResolver {
	private spanId: string | undefined;
	private creating: Promise<string> | undefined;
	private finished = false;

	constructor(
		private readonly sessionId: string,
		private readonly client: AdlrClient,
		managedSpanId?: string,
	) {
		this.spanId = managedSpanId;
	}

	/** Returns the span ID only if the root span has already been resolved/created. */
	get currentSpanId(): string | undefined {
		return this.spanId;
	}

	/** Returns true if the root span has already been finished. */
	get isFinished(): boolean {
		return this.finished;
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

	async finish(status: "done" | "failed" = "done"): Promise<void> {
		if (this.finished) return;
		const id = this.currentSpanId;
		if (!id) return;
		this.finished = true;
		await this.client.span.finish(id, status);
	}
}
