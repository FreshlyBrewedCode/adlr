import { expect, mock, test } from "bun:test";
import type { createAdlerKeymap as CreateAdlerKeymapFn } from "../src/keymap.ts";

test("createAdlerKeymap returns a Keymap instance", async () => {
	// Use a cache-busting query to bypass any mock.module() override from other test files
	// (mock.module overrides in Bun persist across files and cannot be undone with mock.restore())
	// @ts-expect-error bun cache-busting import with ?fresh=1 query
	const { createAdlerKeymap } = (await import("../src/keymap.ts?fresh=1")) as {
		createAdlerKeymap: typeof CreateAdlerKeymapFn;
	};
	const { Keymap } = await import("@opentui/keymap");

	// createAdlerKeymap needs a renderer-like object with keyInput event emitter
	// prependListener and off are used by the opentui keymap host
	const noop = mock(() => {});
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
	} as unknown as Parameters<typeof createAdlerKeymap>[0];
	const keymap = createAdlerKeymap(mockRenderer);
	expect(keymap).toBeInstanceOf(Keymap);
});
