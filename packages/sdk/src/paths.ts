import { homedir } from "node:os";
import { join } from "node:path";

export function getAdlrDir(): string {
	return process.env.ADLR_DIR ?? join(homedir(), ".local/share/adlr");
}

export function getSocketPath(): string {
	return process.env.ADLR_SOCKET ?? join(getAdlrDir(), "adlr.sock");
}

export function getDbPath(): string {
	return process.env.ADLR_DB ?? join(getAdlrDir(), "adlr.db");
}

export function getPidFile(): string {
	return process.env.ADLR_PID_FILE ?? join(getAdlrDir(), "adlr.pid");
}
