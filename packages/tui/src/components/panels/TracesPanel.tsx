import type { Span } from "@adlr/sdk";
import { useBindings } from "@opentui/keymap/react";
import { useMemo, useState } from "react";
import type { PanelProps } from "../../core/types";
import { SelectList } from "../SelectList";
import { TreeNode } from "../TreeNode";

function buildChildrenMap(spans: Span[]): Map<string, Span[]> {
	const map = new Map<string, Span[]>();
	for (const span of spans) {
		if (span.parent_id !== null) {
			const list = map.get(span.parent_id) ?? [];
			list.push(span);
			map.set(span.parent_id, list);
		}
	}
	for (const list of map.values()) {
		list.sort((a, b) => a.started_at - b.started_at);
	}
	return map;
}

function flattenSpans(
	spans: Span[],
	selectedIndex: number,
): { span: Span; depth: number; isSelected: boolean }[] {
	const result: { span: Span; depth: number; isSelected: boolean }[] = [];
	const childrenMap = buildChildrenMap(spans);
	const roots = spans
		.filter((s) => s.parent_id === null)
		.sort((a, b) => a.started_at - b.started_at);
	function walk(span: Span, depth: number) {
		const isSelected = result.length === selectedIndex;
		result.push({ span, depth, isSelected });
		const children = childrenMap.get(span.id) ?? [];
		for (const child of children) {
			walk(child, depth + 1);
		}
	}
	for (const root of roots) {
		walk(root, 0);
	}
	return result;
}

export function TracesPanel({ state, width, height }: PanelProps) {
	const [selectedIndex, setSelectedIndex] = useState(0);
	const flatList = useMemo(
		() => flattenSpans(state.spans, selectedIndex),
		[state.spans, selectedIndex],
	);

	useBindings(
		() => ({
			commands: [
				{
					name: "traces:up",
					run() {
						setSelectedIndex((i) => Math.max(0, i - 1));
					},
				},
				{
					name: "traces:down",
					run() {
						setSelectedIndex((i) =>
							Math.max(0, Math.min(flatList.length - 1, i + 1)),
						);
					},
				},
				{
					name: "traces:expand",
					run() {
						// TODO: toggle expansion
					},
				},
			],
			bindings: [
				{ key: "up", cmd: "traces:up" },
				{ key: "down", cmd: "traces:down" },
				{ key: "return", cmd: "traces:expand" },
			],
		}),
		[flatList.length],
	);

	return (
		<box style={{ flexDirection: "column", width, height }}>
			<SelectList<{ span: Span; depth: number; isSelected: boolean }>
				items={flatList}
				selectedIndex={selectedIndex}
				renderItem={({ span, depth, isSelected }) => (
					<TreeNode span={span} depth={depth} isSelected={isSelected} />
				)}
			/>
		</box>
	);
}
