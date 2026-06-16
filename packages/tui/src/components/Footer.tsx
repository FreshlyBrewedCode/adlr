import { Box, Text } from "ink"
import { PanelRegistry } from "../core/PanelRegistry"

export function Footer({ focusedPanelId }: { focusedPanelId: string | null }) {
  const panel = focusedPanelId ? PanelRegistry.get(focusedPanelId) : null
  const hotkeys = [
    ...(panel?.hotkeys?.map(h => `${h.key}=${h.description}`) ?? []),
    "? help",
    "q quit"
  ]
  return (
    <Box height={1} justifyContent="space-between">
      <Box>
        {hotkeys.map((hk) => (
          <Text key={hk} backgroundColor="blue" color="white">
            {" "}{hk}{" "}
          </Text>
        ))}
      </Box>
      <Text dimColor>{panel?.title ?? "No panel focused"}</Text>
    </Box>
  )
}
