import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { Component, useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useBookmarks } from "@/contexts/BookmarkContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { tokens } from "@/theme/tokens";

type Props = {
  countrySlug: string;
  size?: number;
};

class BookmarkErrorBoundary extends Component<{ children: React.ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error) { console.warn("[BookmarkButton] render error:", error?.message); }
  render() { return this.state.hasError ? null : this.props.children; }
}

function BookmarkButtonInner({ countrySlug, size = 22 }: Props) {
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
        onPress={handlePress}
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

export function BookmarkButton(props: Props) {
  return (
    <BookmarkErrorBoundary>
      <BookmarkButtonInner {...props} />
    </BookmarkErrorBoundary>
  );
}
