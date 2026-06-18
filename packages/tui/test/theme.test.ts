import { describe, expect, test } from "bun:test";
import { Theme } from "../src/theme";

describe("Theme", () => {
	test("has all required top-level keys", () => {
		expect(Theme.background).toBe("black");
		expect(Theme.foreground).toBe("white");
		expect(Theme.primary).toBe("cyan");
		expect(Theme.success).toBe("green");
		expect(Theme.error).toBe("red");
	});

	test("has nested status colors", () => {
		expect(Theme.status.done).toBe("green");
		expect(Theme.status.failed).toBe("red");
		expect(Theme.status.running).toBe("blue");
	});

	test("has nested type colors", () => {
		expect(Theme.type.goal).toBe("green");
		expect(Theme.type.url).toBe("blue");
	});

	test("has nested level colors", () => {
		expect(Theme.level.info).toBe("green");
		expect(Theme.level.error).toBe("red");
	});

	test("has panel chrome colors", () => {
		expect(Theme.panel.border).toBe("gray");
		expect(Theme.panel.activeBorder).toBe("cyan");
		expect(Theme.panel.title).toBe("cyan");
	});

	test("has footer badge colors", () => {
		expect(Theme.footer.badgeBg).toBe("gray");
		expect(Theme.footer.badgeText).toBe("white");
	});
});
