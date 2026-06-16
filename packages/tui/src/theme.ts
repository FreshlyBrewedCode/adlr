export const Theme = {
  // Base
  background: "black",
  foreground: "white",
  muted: "gray",
  border: "gray",

  // Semantic
  primary: "cyan",
  success: "green",
  error: "red",
  warning: "yellow",
  running: "blue",
  info: "blue",

  // UI chrome
  header: {
    session: "cyan",
    status: {
      active: "green",
      completed: "gray",
    },
  },
  footer: {
    badgeBg: "gray",
    badgeText: "white",
    separator: "gray",
  },
  panel: {
    title: "cyan",
    border: "gray",
    activeBorder: "cyan",
  },
  card: {
    base: "#222222",
  },

  // Data
  status: {
    done: "green",
    failed: "red",
    blocked: "yellow",
    running: "blue",
    pending: "gray",
  },
  type: {
    goal: "green",
    url: "blue",
    file: "yellow",
    text: "white",
  },
  level: {
    info: "green",
    warn: "yellow",
    error: "red",
    other: "white",
  },
} as const
