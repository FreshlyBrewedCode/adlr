import { expect, test } from "bun:test";
import { DAEMON_SESSION_ID } from "../src/constants";

test("DAEMON_SESSION_ID is __daemon__", () => {
	expect(DAEMON_SESSION_ID).toBe("__daemon__");
});
