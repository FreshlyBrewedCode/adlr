import { Theme } from "../theme";

export function StatusBadge({ status }: { status: string }) {
	const color =
		Theme.status[status as keyof typeof Theme.status] ?? Theme.muted;
	return <text fg={color}>● {status}</text>;
}
