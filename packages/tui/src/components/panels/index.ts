import { PanelRegistry } from "../../core/PanelRegistry"
import { OverviewPanel } from "./OverviewPanel"
import { AgentsPanel } from "./AgentsPanel"
import { TracesPanel } from "./TracesPanel"
import { LogsPanel } from "./LogsPanel"
import { ContextPanel } from "./ContextPanel"

export function registerPanels() {
  PanelRegistry.register({
    id: "overview",
    title: "Overview",
    component: OverviewPanel,
  })

  PanelRegistry.register({
    id: "context",
    title: "Context",
    component: ContextPanel,
    hotkeys: [
      { key: "↑↓", description: "navigate" },
    ]
  })

  PanelRegistry.register({
    id: "agents",
    title: "Agents",
    component: AgentsPanel,
    hotkeys: [
      { key: "↑↓", description: "navigate" },
      { key: "enter", description: "attach to running agent or read output" },
    ]
  })

  PanelRegistry.register({
    id: "traces",
    title: "Traces",
    component: TracesPanel,
    hotkeys: [
      { key: "↑↓", description: "navigate" },
      { key: "enter", description: "expand/collapse" },
    ]
  })

  PanelRegistry.register({
    id: "logs",
    title: "Logs",
    component: LogsPanel,
    hotkeys: [
      { key: "d", description: "Toggle daemon/session view" },
      { key: "i", description: "Filter info" },
      { key: "w", description: "Filter warn" },
      { key: "e", description: "Filter error" },
      { key: "f", description: "Toggle auto-scroll" },
    ]
  })
}

export { OverviewPanel, AgentsPanel, TracesPanel, LogsPanel, ContextPanel }
