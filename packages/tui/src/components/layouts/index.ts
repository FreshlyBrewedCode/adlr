import { LayoutRegistry } from "../../core/LayoutRegistry";
import { SplitLayout } from "./SplitLayout";
import { TabsLayout } from "./TabsLayout";

export function registerLayouts() {
	LayoutRegistry.register({
		id: "tabs",
		component: TabsLayout,
		defaultLayoutProps: { tabPosition: "top" },
	});

	LayoutRegistry.register({
		id: "split",
		component: SplitLayout,
		defaultLayoutProps: { ratio: 0.5, direction: "horizontal" },
	});
}

export { SplitLayout, TabsLayout };
