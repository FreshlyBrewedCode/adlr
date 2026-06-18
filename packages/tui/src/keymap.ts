import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui"
import type { CliRenderer } from "@opentui/core"
import type { Keymap } from "@opentui/keymap"
import type { Renderable, KeyEvent } from "@opentui/core"

export type AdlerKeymap = Keymap<Renderable, KeyEvent>

export function createAdlerKeymap(renderer: CliRenderer): AdlerKeymap {
  return createDefaultOpenTuiKeymap(renderer)
}
