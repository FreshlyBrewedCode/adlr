import { Box, Text } from "ink"
import type { Session } from "@adler/sdk"
import { Theme } from "../theme"

export function Header({ session }: { session: Session | null }) {
  const statusColor = session?.status === "active"
    ? Theme.header.status.active
    : Theme.header.status.completed
  return (
    <Box height={1}>
      <Text bold>adler</Text>
      <Text dimColor> · session: </Text>
      <Text color={Theme.primary}>{session?.id.slice(0, 6)}</Text>
      <Text dimColor> · </Text>
      <Text color={statusColor}>{session?.status}</Text>
      <Text dimColor> · {session?.working_dir}</Text>
    </Box>
  )
}
