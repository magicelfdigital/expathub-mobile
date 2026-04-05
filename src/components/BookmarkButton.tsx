import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Alert, Platform, Pressable, View } from "react-native";

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

  const canBookmark = hasActiveSubscription || active || bookmarkCount < 1;

  if (user && !canBookmark) return null;

  const handlePress = useCallback(async () => {
    if (!user) {
      router.push("/auth?mode=register" as any);
      return;
    }

    setBusy(true);
    try {
      await toggleBookmark(countrySlug);
    } catch (e: any) {
      console.warn("[Bookmark] toggle failed:", e?.message ?? e);
    } finally {
      setBusy(false);
    }
  }, [user, active, hasActiveSubscription, bookmarkCount, countrySlug, toggleBookmark, router]);

  return (
    <View onStartShouldSetResponder={() => true}>
      <Pressable
        onPress={(e) => {
          e.stopPropagation();
          handlePress();
        }}
        hitSlop={10}
        disabled={busy}
        style={({ pressed }) => [{ opacity: pressed || busy ? 0.5 : 1, padding: 4 }]}
        testID={`bookmark-${countrySlug}`}
      >
        <Ionicons
          name={active ? "bookmark" : "bookmark-outline"}
          size={size}
          color={active ? tokens.color.gold : tokens.color.subtext}
        />
      </Pressable>
    </View>
  );
}
