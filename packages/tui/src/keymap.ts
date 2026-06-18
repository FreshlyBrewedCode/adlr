import type { CliRenderer, KeyEvent, Renderable } from "@opentui/core";
import type { Keymap } from "@opentui/keymap";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";

export type AdlerKeymap = Keymap<Renderable, KeyEvent>;

export function createAdlerKeymap(renderer: CliRenderer): AdlerKeymap {
	return createDefaultOpenTuiKeymap(renderer);
}
