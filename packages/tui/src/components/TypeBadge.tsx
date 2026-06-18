import { Theme } from "../theme";

export function TypeBadge({ type }: { type: string }) {
	const bg = Theme.type[type as keyof typeof Theme.type] ?? Theme.muted;
	return (
		<text bg={bg} fg="black">
			{" "}
			{type.toUpperCase()}{" "}
		</text>
	);
}
