export function parseFlags(args: string[]): Record<string, string> & { _?: string[] } {
  const flags: Record<string, string> = {}
  const positional: string[] = []
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2)
      const value = args[i + 1] ?? ""
      if (!value.startsWith("--")) {
        flags[key] = value
        i++
      } else {
        flags[key] = "true"
      }
    } else {
      positional.push(args[i])
    }
  }
  return { ...flags, _: positional } as Record<string, string> & { _?: string[] }
}
