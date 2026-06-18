import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";

// Set session env before any module is imported
process.env.ADLR_SESSION = "test-session";

// Capture real implementations before mocking so we can restore them in afterAll.
// mock.module() replacements are permanent in Bun (mock.restore() does not undo them),
// so we re-register the real modules after our tests are done.
const realKeymap = await import("../src/keymap.ts");
const realLoadConfig = await import("../src/loadConfig.ts");
const realApp = await import("../src/app.tsx");
const realOpentui = await import("@opentui/core");
const realOpentuiReact = await import("@opentui/react");

// Mock OpenTUI before import
const mockRenderer = {
	destroy: mock(() => {}),
	on: mock(() => {}),
	isDestroyed: false,
};

const mockRoot = {
	render: mock(() => {}),
};

mock.module("@opentui/core", () => ({
	createCliRenderer: mock(async () => mockRenderer),
}));

mock.module("@opentui/react", () => ({
	createRoot: mock(() => mockRoot),
}));

mock.module("../src/keymap.ts", () => ({
	createAdlerKeymap: mock(() => ({})),
}));

mock.module("../src/loadConfig.ts", () => ({
	loadConfig: mock(async () => ({})),
}));

mock.module("../src/app.tsx", () => ({
	default: () => null,
}));

beforeEach(() => {
	process.env.ADLR_SESSION = "test-session";
	mockRenderer.destroy.mockClear();
	mockRoot.render.mockClear();
});

afterEach(() => {
	delete process.env.ADLR_SESSION;
});

// Restore real module implementations so subsequent test files see the real modules.
afterAll(() => {
	mock.module("../src/keymap.ts", () => realKeymap);
	mock.module("../src/loadConfig.ts", () => realLoadConfig);
	mock.module("../src/app.tsx", () => realApp);
	mock.module("@opentui/core", () => realOpentui);
	mock.module("@opentui/react", () => realOpentuiReact);
});

test("runTui creates a renderer in alternate-screen mode", async () => {
	const { runTui } = await import("../src/index.ts");
	await runTui();
	const { createCliRenderer } = await import("@opentui/core");
	expect(createCliRenderer).toHaveBeenCalledWith(
		expect.objectContaining({ screenMode: "alternate-screen" }),
	);
});

test("runTui renders App into the root", async () => {
	const { runTui } = await import("../src/index.ts");
	await runTui();
	expect(mockRoot.render).toHaveBeenCalled();
});

test("runTui returns a cleanup function that destroys the renderer", async () => {
	const { runTui } = await import("../src/index.ts");
	const cleanup = await runTui();
	expect(typeof cleanup).toBe("function");
	cleanup();
	expect(mockRenderer.destroy).toHaveBeenCalled();
});
