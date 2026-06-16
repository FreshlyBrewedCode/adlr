import { Box, Text } from "ink"
import type { Session } from "@adler/sdk"

export function Header({ session }: { session: Session | null }) {
  return (
    <Box flexDirection="column" height={1}>
      <Box>
        <Text bold>adler</Text>
        <Text> · session: {session?.id.slice(0, 6)}</Text>
        <Text> · {session?.status}</Text>
        <Text> · {session?.working_dir}</Text>
      </Box>
    </Box>
  )
}
