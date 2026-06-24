export class SpanMap {
	private map = new Map<string, string>();
	private finished = new Set<string>();

	set(opencodeSessionId: string, adlrSpanId: string): void {
		this.map.set(opencodeSessionId, adlrSpanId);
	}

	get(opencodeSessionId: string): string | undefined {
		return this.map.get(opencodeSessionId);
	}

	has(opencodeSessionId: string): boolean {
		return this.map.has(opencodeSessionId);
	}

	markFinished(opencodeSessionId: string): void {
		this.finished.add(opencodeSessionId);
	}

	isFinished(opencodeSessionId: string): boolean {
		return this.finished.has(opencodeSessionId);
	}

	delete(opencodeSessionId: string): void {
		this.map.delete(opencodeSessionId);
		this.finished.delete(opencodeSessionId);
	}
}
