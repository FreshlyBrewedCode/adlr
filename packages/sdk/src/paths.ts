import { homedir } from "os"
import { join } from "path"

export const ADLER_DIR = join(homedir(), ".local/share/adler")
export const SOCKET_PATH = join(ADLER_DIR, "adler.sock")
export const DB_PATH = join(ADLER_DIR, "adler.db")
export const PID_FILE = join(ADLER_DIR, "adler.pid")
