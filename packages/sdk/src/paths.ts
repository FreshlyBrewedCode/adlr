import { homedir } from "node:os";
import { join } from "node:path";

export const ADLR_DIR = join(homedir(), ".local/share/adlr");
export const SOCKET_PATH = join(ADLR_DIR, "adlr.sock");
export const DB_PATH = join(ADLR_DIR, "adlr.db");
export const PID_FILE = join(ADLR_DIR, "adlr.pid");
