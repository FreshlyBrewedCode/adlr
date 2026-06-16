import { LayoutRegistry } from "../../core/LayoutRegistry"
import { TabsLayout } from "./TabsLayout"
import { SplitLayout } from "./SplitLayout"

export function registerLayouts() {
  LayoutRegistry.register({
    id: "tabs",
    component: TabsLayout,
    defaultLayoutProps: { tabPosition: "top" },
  })

  LayoutRegistry.register({
    id: "split",
    component: SplitLayout,
    defaultLayoutProps: { ratio: 0.5, direction: "horizontal" },
  })
}

export { TabsLayout, SplitLayout }
