export const tokens = {
  color: {
    bg: "#F7F5F0",
    surface: "#FFFFFF",
    border: "rgba(0,0,0,0.10)",
    text: "#0B1220",
    subtext: "rgba(11,18,32,0.65)",
    primary: "#009C9C",
    primarySoft: "rgba(0,156,156,0.12)",
    primaryBorder: "rgba(0,156,156,0.25)",
    white: "#FFFFFF",
    dark: "#0B1220",
  },

  space: {
    xs: 6,
    sm: 10,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 28,
  },

  radius: {
    sm: 10,
    md: 12,
    lg: 16,
    pill: 999,
  },

  text: {
    small: 12,
    body: 14,
    h3: 16,
    h2: 20,
    h1: 26,
  },

  weight: {
    regular: "400" as const,
    bold: "700" as const,
    black: "900" as const,
  },
} as const;
