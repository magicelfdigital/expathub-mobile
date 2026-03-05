import { colors } from "@/constants/colors";

export const tokens = {
  color: {
    headerBlue: colors.navy,
    bg: colors.cream,
    surface: colors.surface,
    border: colors.border,
    shadow: colors.shadow,
    text: colors.navy,
    subtext: colors.textMid,
    textSoft: colors.textSoft,
    primary: colors.blue,
    primarySoft: colors.tealLight,
    primaryBorder: colors.border,
    teal: colors.teal,
    tealLight: colors.tealLight,
    gold: colors.gold,
    goldLight: colors.goldLight,
    white: colors.surface,
    dark: colors.navy,
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
