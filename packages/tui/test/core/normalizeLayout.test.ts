import { describe, expect, test } from "bun:test";
import { normalizeLayout } from "../../src/core/normalizeLayout";

describe("normalizeLayout", () => {
	test("leaves PanelNode unchanged", () => {
		expect(normalizeLayout({ panel: "overview" })).toEqual({
			panel: "overview",
		});
	});

	test("expands string shorthand to PanelNode", () => {
		expect(normalizeLayout("overview")).toEqual({ panel: "overview" });
	});

	test("normalizes string shorthands inside layout content", () => {
		const input = { layout: "tabs", content: ["overview", "logs"] };
		const result = normalizeLayout(input);
		expect(result).toEqual({
			layout: "tabs",
			content: [{ panel: "overview" }, { panel: "logs" }],
		});
	});

	test("recursively normalizes nested layouts", () => {
		const input = {
			layout: "split",
			ratio: 0.5,
			content: ["overview", { layout: "tabs", content: ["traces", "logs"] }],
		};
		const result = normalizeLayout(input);
		expect(result).toEqual({
			layout: "split",
			ratio: 0.5,
			content: [
				{ panel: "overview" },
				{ layout: "tabs", content: [{ panel: "traces" }, { panel: "logs" }] },
			],
		});
	});

	test("leaves explicit PanelNode objects unchanged inside content", () => {
		const input = { layout: "tabs", content: [{ panel: "overview" }] };
		expect(normalizeLayout(input)).toEqual({
			layout: "tabs",
			content: [{ panel: "overview" }],
		});
	});
});
