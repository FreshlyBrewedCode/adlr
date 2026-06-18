import { describe, expect, test } from "bun:test";
import type {
	HotkeyDefinition,
	LayoutDefinition,
	LayoutNode,
	PanelDefinition,
	TreeNode,
} from "../../src/core/types";

describe("core types", () => {
	test("TreeNode array can contain both LayoutNode and PanelNode", () => {
		const nodes: TreeNode[] = [
			{ layout: "tabs", content: [] },
			{ panel: "overview" },
		];
		expect("layout" in nodes[0]).toBe(true);
		expect("panel" in nodes[1]).toBe(true);
	});

	test("LayoutNode can contain nested LayoutNode content", () => {
		const node: LayoutNode = {
			layout: "split",
			direction: "horizontal",
			content: [
				{
					layout: "tabs",
					tabPosition: "top",
					content: [{ panel: "nested" }],
				},
			],
		};
		expect("layout" in (node.content[0] as object)).toBe(true);
		expect((node.content[0] as LayoutNode).layout).toBe("tabs");
	});

	test("PanelDefinition hotkeys are optional and can be omitted", () => {
		const panel: PanelDefinition = {
			id: "no-hotkeys",
			title: "No Hotkeys",
			component: () => null,
		};
		expect(panel.hotkeys).toBeUndefined();
	});

	test("PanelDefinition has required fields", () => {
		const panel: PanelDefinition = {
			id: "test",
			title: "Test",
			component: () => null,
			hotkeys: [{ key: "a", description: "do a" }],
		};
		expect(panel.hotkeys).toBeDefined();
		expect(panel.hotkeys).toHaveLength(1);
	});

	test("LayoutDefinition has the required fields", () => {
		const layout: LayoutDefinition = {
			id: "tabs",
			component: () => null,
		};
		expect(layout.id).toBe("tabs");
		expect(layout.component).toBeDefined();
	});

	test("HotkeyDefinition handler is optional", () => {
		const hotkey: HotkeyDefinition = {
			key: "a",
			description: "do a",
		};
		expect(hotkey.key).toBe("a");
		expect(hotkey.description).toBe("do a");
		expect(hotkey.handler).toBeUndefined();
	});

	test("LayoutDefinition defaultLayoutProps is optional", () => {
		const layoutWithDefaults: LayoutDefinition = {
			id: "split",
			component: () => null,
			defaultLayoutProps: { ratio: 0.5 },
		};
		expect(layoutWithDefaults.defaultLayoutProps).toBeDefined();
		expect(layoutWithDefaults.defaultLayoutProps?.ratio).toBe(0.5);

		const layoutWithoutDefaults: LayoutDefinition = {
			id: "tabs",
			component: () => null,
		};
		expect(layoutWithoutDefaults.defaultLayoutProps).toBeUndefined();
	});
});
