import {
	type AdlerConfig,
	createClient,
	DAEMON_SESSION_ID,
	type EventType,
} from "@adler/sdk";
import { KeymapProvider, useBindings } from "@opentui/keymap/react";
import { useRenderer, useTerminalDimensions } from "@opentui/react";
import { useEffect, useReducer, useState } from "react";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { HelpModal } from "./components/HelpModal";
import { registerLayouts } from "./components/layouts";
import { registerPanels } from "./components/panels";
import { LayoutRenderer } from "./core/LayoutRenderer";
import { normalizeLayout } from "./core/normalizeLayout";
import type { ContentNode, PanelNode, TreeNode } from "./core/types";
import type { AdlerKeymap } from "./keymap";
import { initialState, reducer } from "./types";

const defaultLayout: ContentNode = {
	layout: "tabs",
	content: ["overview", "context", "agents", "traces", "logs"],
};

function resolveFocusedPanel(
	node: TreeNode,
	focusPath: number[],
): string | null {
	if ("panel" in node) return (node as PanelNode).panel;
	if (focusPath.length === 0) return null;
	const childIndex = focusPath[0];
	const child = (node.content as TreeNode[])[childIndex];
	if (!child) return null;
	return resolveFocusedPanel(child, focusPath.slice(1));
}

interface AppProps {
	sessionId: string;
	layout?: ContentNode;
	keymap: AdlerKeymap;
	config?: AdlerConfig;
}

function AppInner({
	sessionId,
	layout: layoutProp,
}: Omit<AppProps, "keymap" | "config">) {
	const [state, dispatch] = useReducer(reducer, initialState);
	const [isHelpOpen, setIsHelpOpen] = useState(false);
	const [focusPath, setFocusPath] = useState<number[]>([0]);
	const [layout] = useState<TreeNode>(() =>
		normalizeLayout(layoutProp ?? defaultLayout),
	);
	const renderer = useRenderer();
	const { width, height } = useTerminalDimensions();

	useEffect(() => {
		registerPanels();
		registerLayouts();
	}, []);

	useEffect(() => {
		const client = createClient();
		let cleanup: (() => void) | undefined;
		(async () => {
			try {
				const unsub = await client.subscribe(sessionId, (msg) => {
					if (msg.type === "snapshot") {
						dispatch({ type: "snapshot", payload: msg.payload });
					} else if (msg.type === "event") {
						const payload = msg.payload as Record<string, unknown>;
						dispatch({
							type: "event",
							payload: {
								id: Date.now(),
								session_id: sessionId,
								span_id:
									typeof payload?.span_id === "string" ? payload.span_id : null,
								type: msg.event as EventType,
								data: payload,
								timestamp: Date.now(),
							},
						});
					}
				});
				cleanup = unsub;
			} catch (err) {
				dispatch({
					type: "event",
					payload: {
						id: Date.now(),
						session_id: sessionId,
						span_id: null,
						type: "log.error",
						data: { message: String(err) },
						timestamp: Date.now(),
					},
				});
			}
		})();
		return () => {
			cleanup?.();
			client.close();
		};
	}, [sessionId]);

	useEffect(() => {
		const client = createClient();
		let cleanup: (() => void) | undefined;
		(async () => {
			try {
				const unsub = await client.subscribe(DAEMON_SESSION_ID, (msg) => {
					if (msg.type === "snapshot") {
						dispatch({
							type: "daemonSnapshot",
							payload: msg.payload.events ?? [],
						});
					} else if (msg.type === "event") {
						const payload = msg.payload as Record<string, unknown>;
						dispatch({
							type: "daemonEvent",
							payload: {
								id: Date.now(),
								session_id: DAEMON_SESSION_ID,
								span_id: null,
								type: msg.event as EventType,
								data: payload,
								timestamp: Date.now(),
							},
						});
					}
				});
				cleanup = unsub;
			} catch {
				// Daemon events are best-effort
			}
		})();
		return () => {
			cleanup?.();
			client.close();
		};
	}, []);

	useBindings(
		() => ({
			bindings: [
				{
					key: "?",
					cmd: () => {
						if (isHelpOpen) {
							setIsHelpOpen(false);
						} else {
							setIsHelpOpen(true);
						}
					},
				},
				{
					key: "escape",
					cmd: () => {
						if (isHelpOpen) {
							setIsHelpOpen(false);
						}
					},
				},
				{
					key: "q",
					cmd: () => {
						if (!isHelpOpen) {
							renderer.destroy();
						}
					},
				},
				{
					key: "ctrl+c",
					cmd: () => {
						renderer.destroy();
					},
				},
				{
					key: "tab",
					cmd: () => {
						if (!isHelpOpen) {
							setFocusPath((path) => {
								if (path.length === 0) return [0];
								const newPath = [...path];
								newPath[0] = Math.min(4, newPath[0] + 1);
								return newPath;
							});
						}
					},
				},
				{
					key: "shift+tab",
					cmd: () => {
						if (!isHelpOpen) {
							setFocusPath((path) => {
								if (path.length === 0) return [0];
								const newPath = [...path];
								newPath[0] = Math.max(0, newPath[0] - 1);
								return newPath;
							});
						}
					},
				},
			],
		}),
		[isHelpOpen, renderer],
	);

	const focusedPanel = resolveFocusedPanel(layout, focusPath);

	return (
		<box style={{ flexDirection: "column", width, height }}>
			<Header session={state.session} />
			<box style={{ flexGrow: 1, overflow: "hidden" }}>
				<LayoutRenderer
					node={layout}
					state={state}
					dispatch={dispatch}
					width={width}
					height={height - 2}
					focusPath={focusPath}
					onFocusChange={setFocusPath}
				/>
			</box>
			{isHelpOpen && (
				<box
					style={{
						position: "absolute",
						width,
						height,
						justifyContent: "center",
						alignItems: "center",
					}}
				>
					<HelpModal onClose={() => setIsHelpOpen(false)} />
				</box>
			)}
			<Footer focusedPanelId={focusedPanel} />
		</box>
	);
}

export default function App({ sessionId, layout, keymap }: AppProps) {
	return (
		<KeymapProvider keymap={keymap}>
			<AppInner sessionId={sessionId} layout={layout} />
		</KeymapProvider>
	);
}
