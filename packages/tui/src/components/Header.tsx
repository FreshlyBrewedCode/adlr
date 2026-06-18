import type { Session } from "@adlr/sdk";
import { Theme } from "../theme";

export function Header({ session }: { session: Session | null }) {
	const statusColor =
		session?.status === "active"
			? Theme.header.status.active
			: Theme.header.status.completed;
	return (
		<box style={{ height: 1 }}>
			<text>
				<b>adlr</b>
				<span fg="#666"> · session: </span>
				<span fg={Theme.primary}>{session?.id.slice(0, 6)}</span>
				<span fg="#666"> · </span>
				<span fg={statusColor}>{session?.status}</span>
				<span fg="#666"> · {session?.working_dir}</span>
			</text>
		</box>
	);
}
