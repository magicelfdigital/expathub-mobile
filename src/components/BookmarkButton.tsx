import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Platform, Pressable } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useBookmarks } from "@/contexts/BookmarkContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { tokens } from "@/theme/tokens";

type Props = {
  countrySlug: string;
  size?: number;
};

export function BookmarkButton({ countrySlug, size = 22 }: Props) {
  const { user } = useAuth();
  const { isBookmarked, toggleBookmark, bookmarkCount } = useBookmarks();
  const { hasActiveSubscription } = useSubscription();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const active = isBookmarked(countrySlug);

  const handlePress = useCallback(async () => {
    if (!user) {
      router.push("/auth?mode=register" as any);
      return;
    }

    if (!active && !hasActiveSubscription && bookmarkCount >= 1) {
      if (Platform.OS === "web") {
        window.alert("Upgrade to save more countries to your shortlist.");
      } else {
        Alert.alert(
          "Upgrade Required",
          "Free accounts can save 1 country. Upgrade to save more.",
          [
            { text: "Not Now", style: "cancel" },
            { text: "View Plans", onPress: () => router.push("/subscribe" as any) },
          ]
        );
      }
      return;
    }

    setBusy(true);
    try {
      await toggleBookmark(countrySlug);
    } catch {
    } finally {
      setBusy(false);
    }
  }, [user, active, hasActiveSubscription, bookmarkCount, countrySlug, toggleBookmark, router]);

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={10}
      disabled={busy}
      style={({ pressed }) => [{ opacity: pressed || busy ? 0.5 : 1 }]}
      testID={`bookmark-${countrySlug}`}
    >
      <Ionicons
        name={active ? "bookmark" : "bookmark-outline"}
        size={size}
        color={active ? tokens.color.gold : tokens.color.subtext}
      />
    </Pressable>
  );
}
