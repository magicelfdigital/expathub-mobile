export const tokens = {
  color: {
    headerBlue: "#364F9A",
    bg: "#F9F7F4",
    surface: "#FFFFFF",
    border: "rgba(74,100,184,0.10)",
    shadow: "rgba(42,58,106,0.07)",
    text: "#2A3A6A",
    subtext: "#5A6785",
    textSoft: "#9BA8C0",
    primary: "#4A64B8",
    primarySoft: "#EEF1FA",
    primaryBorder: "rgba(74,100,184,0.20)",
    teal: "#18A8AE",
    tealLight: "#EAF7F8",
    gold: "#E8991A",
    goldLight: "#FEF4E2",
    white: "#FFFFFF",
    dark: "#2A3A6A",
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
    sm: 6,
    md: 12,
    lg: 14,
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
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    black: "900" as const,
  },

  font: {
    display: "Lora_600SemiBold",
    body: "DMSans_400Regular",
    bodyMedium: "DMSans_500Medium",
    bodySemiBold: "DMSans_600SemiBold",
    bodyBold: "DMSans_700Bold",
  },
} as const;
