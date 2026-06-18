import type { PanelDefinition } from "./types";

const panels = new Map<string, PanelDefinition>();

export const PanelRegistry = {
	register(def: PanelDefinition): void {
		panels.set(def.id, def);
	},

	get(id: string): PanelDefinition | undefined {
		return panels.get(id);
	},

	getAll(): PanelDefinition[] {
		return Array.from(panels.values());
	},

	clear(): void {
		panels.clear();
	},
};
