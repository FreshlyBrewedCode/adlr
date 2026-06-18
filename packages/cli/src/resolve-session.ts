import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function resolveSessionId(options: {
	session?: string;
}): string | undefined {
	if (options.session) {
		return options.session;
	}

	if (process.env.ADLR_SESSION) {
		return process.env.ADLR_SESSION;
	}

	const sessionFile = join(process.cwd(), ".adlr", ".session");
	try {
		if (existsSync(sessionFile)) {
			return readFileSync(sessionFile, "utf-8").trim();
		}
	} catch {
		// ignore file I/O errors
	}

	return undefined;
}
