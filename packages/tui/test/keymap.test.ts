import { test, expect, mock } from "bun:test"

test("createAdlerKeymap returns a Keymap instance", async () => {
  const { createAdlerKeymap } = await import("../src/keymap.ts")
  const { Keymap } = await import("@opentui/keymap")

  // createAdlerKeymap needs a renderer-like object with keyInput event emitter
  // prependListener and off are used by the opentui keymap host
  const noop = mock(() => {})
  const mockRenderer = {
    isDestroyed: false,
    root: {},
    capabilities: {},
    currentFocusedRenderable: null,
    keyInput: {
      prependListener: noop,
      off: noop,
    },
    on: noop,
    off: noop,
    once: noop,
    prependInputHandler: noop,
    removeInputHandler: noop,
  } as any
  const keymap = createAdlerKeymap(mockRenderer)
  expect(keymap).toBeInstanceOf(Keymap)
})
