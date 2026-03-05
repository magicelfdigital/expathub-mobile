import { colors } from "@/constants/colors";

export const tokens = {
  color: {
    headerBlue: colors.navy,
    bg: 'transparent',
    surface: colors.surface,
    border: colors.border,
    borderDark: colors.borderDark,
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
    white: '#FFFFFF',
    dark: colors.navy,
    cream: colors.cream,
    onDark: colors.onDark,
    onDarkMid: colors.onDarkMid,
    onDarkSoft: colors.onDarkSoft,
    cardBg: colors.cardBg,
    glassDark: colors.glassDark,
    glassLight: colors.glassLight,
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

  card: {
    backgroundColor: colors.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.50)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;
