import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { tokens } from "@/theme/tokens";

type ComingSoonProps = {
  title: string;
  message: string;
  ctaLabel?: string;
  onPressCta?: () => void;
};

export function ComingSoon({ title, message, ctaLabel, onPressCta }: ComingSoonProps) {
  return (
    <View style={s.wrapper}>
      <View style={s.card}>
        <View style={s.iconCircle}>
          <Ionicons name="time-outline" size={28} color={tokens.color.subtext} />
        </View>
        <Text style={s.title}>{title}</Text>
        <Text style={s.message}>{message}</Text>
        {ctaLabel && onPressCta ? (
          <Pressable
            onPress={onPressCta}
            style={({ pressed }) => [s.cta, pressed && s.ctaPressed]}
          >
            <Text style={s.ctaText}>{ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const s = {
  wrapper: {
    flex: 1,
    justifyContent: "center" as const,
    alignItems: "center" as const,
    padding: tokens.space.xl,
  },
  card: {
    width: "100%" as const,
    padding: tokens.space.xl,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    alignItems: "center" as const,
    gap: tokens.space.sm,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: tokens.color.primarySoft,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginBottom: tokens.space.xs,
  },
  title: {
    fontSize: tokens.text.h2,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    textAlign: "center" as const,
  },
  message: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 22,
    textAlign: "center" as const,
  },
  cta: {
    marginTop: tokens.space.sm,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.primary,
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaText: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.white,
  },
} as const;
