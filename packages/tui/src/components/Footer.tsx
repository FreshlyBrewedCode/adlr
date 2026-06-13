import { Box, Text } from "ink"

const TAB_HOTKEYS: Record<number, string[]> = {
  0: ["tab/shift+tab", "1-5"],
  1: ["↑↓ navigate"],
  2: ["↑↓ navigate", "enter attach", "o open external"],
  3: ["↑↓ navigate", "enter expand"],
  4: ["i/w/e filter", "f auto-scroll"],
}

export function Footer({ activeTab }: { activeTab: number }) {
  const hotkeys = TAB_HOTKEYS[activeTab] ?? []
  return (
    <Box justifyContent="space-between">
      <Box>
        {hotkeys.map((hk) => (
          <Text key={hk} backgroundColor="blue" color="white">
            {" "}{hk}{" "}
          </Text>
        ))}
        <Text backgroundColor="blue" color="white">
          {" "}? help{" "}
        </Text>
      </Box>
      <Text dimColor>Press ? for help</Text>
    </Box>
  )
}
