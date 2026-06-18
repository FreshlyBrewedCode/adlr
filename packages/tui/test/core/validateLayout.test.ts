import { beforeEach, describe, expect, test } from "bun:test";
import { registerLayouts } from "../../src/components/layouts";
import { registerPanels } from "../../src/components/panels";
import { LayoutRegistry } from "../../src/core/LayoutRegistry";
import { PanelRegistry } from "../../src/core/PanelRegistry";
import { validateLayout } from "../../src/core/validateLayout";

describe("validateLayout", () => {
	beforeEach(() => {
		PanelRegistry.clear();
		LayoutRegistry.clear();
		registerPanels();
		registerLayouts();
	});

	test("validates correct tabs tree", () => {
		const tree = {
			layout: "tabs",
			content: [{ panel: "overview" }],
		};
		expect(validateLayout(tree)).toEqual([]);
	});

	test("validates correct split tree", () => {
		const tree = {
			layout: "split",
			ratio: 0.5,
			content: [{ panel: "overview" }, { panel: "logs" }],
		};
		expect(validateLayout(tree)).toEqual([]);
	});

	test("detects unknown panel", () => {
		const tree = { panel: "unknown" };
		expect(validateLayout(tree)).toContain("Unknown panel: unknown");
	});

	test("detects unknown layout", () => {
		const tree = { layout: "grid", content: [{ panel: "overview" }] };
		expect(validateLayout(tree)).toContain("Unknown layout: grid");
	});

	test("detects layout with no children", () => {
		const tree = { layout: "tabs", content: [] };
		expect(validateLayout(tree)).toContain(
			"Layout tabs must have at least one child",
		);
	});

	test("validates split with 3 children", () => {
		const tree = {
			layout: "split",
			content: [
				{ panel: "overview" },
				{ panel: "logs" },
				{ panel: "overview" },
			],
		};
		expect(validateLayout(tree)).toEqual([]);
	});

	test("validates split with 1 child", () => {
		const tree = { layout: "split", content: [{ panel: "overview" }] };
		expect(validateLayout(tree)).toEqual([]);
	});

	test("validates split with ratio array matching child count", () => {
		const tree = {
			layout: "split",
			ratio: [0.3, 0.7],
			content: [{ panel: "overview" }, { panel: "logs" }],
		};
		expect(validateLayout(tree)).toEqual([]);
	});

	test("validates split with ratio array shorter than child count", () => {
		const tree = {
			layout: "split",
			ratio: [0.3, 0.3],
			content: [
				{ panel: "overview" },
				{ panel: "logs" },
				{ panel: "overview" },
			],
		};
		expect(validateLayout(tree)).toEqual([]);
	});

	test("detects split ratio array longer than child count", () => {
		const tree = {
			layout: "split",
			ratio: [0.3, 0.4, 0.3],
			content: [{ panel: "overview" }, { panel: "logs" }],
		};
		expect(validateLayout(tree)).toContain(
			"Split layout ratio array length (3) exceeds child count (2)",
		);
	});

	test("detects split ratio array with non-number values", () => {
		const tree = {
			layout: "split",
			ratio: [0.3, "bad"] as unknown[],
			content: [{ panel: "overview" }, { panel: "logs" }],
		};
		expect(validateLayout(tree)).toContain(
			"Split layout ratio array must contain only numbers",
		);
	});

	test("validates nested layouts recursively", () => {
		const tree = {
			layout: "tabs",
			content: [
				{
					layout: "split",
					content: [{ panel: "overview" }, { panel: "unknown-panel" }],
				},
			],
		};
		expect(validateLayout(tree)).toContain("Unknown panel: unknown-panel");
	});
});
