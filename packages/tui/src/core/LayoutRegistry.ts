import type { LayoutDefinition } from "./types";

const layouts = new Map<string, LayoutDefinition>();

export const LayoutRegistry = {
	register(def: LayoutDefinition): void {
		layouts.set(def.id, def);
	},

	get(id: string): LayoutDefinition | undefined {
		return layouts.get(id);
	},

	getAll(): LayoutDefinition[] {
		return Array.from(layouts.values());
	},

	clear(): void {
		layouts.clear();
	},
};
