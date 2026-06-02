import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { Component, useCallback, useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useBookmarks } from "@/contexts/BookmarkContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { trackEvent } from "@/src/lib/analytics";
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

  const handlePress = useCallback(async () => {
    if (!user) {
      router.push("/auth?mode=register" as any);
      return;
    }

    if (!canBookmark) {
      trackEvent("bookmark_limit_hit", {
        countrySlug,
        currentCount: bookmarkCount,
      });
      router.push("/subscribe" as any);
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
  }, [user, canBookmark, bookmarkCount, countrySlug, toggleBookmark, router]);

  // On web, claim the responder so a click on the bookmark does not bubble up
  // to a parent row Pressable (which would navigate away). On native this hijack
  // is unnecessary — the inner Pressable already becomes the touch responder, so
  // the parent does not fire — and it actively interferes with the touch system
  // when this button is nested inside a row Pressable, causing dropped taps and a
  // wedged "no taps register" state after repeated navigation.
  const claimResponder =
    Platform.OS === "web" ? (() => true) : undefined;

  return (
    <View onStartShouldSetResponder={claimResponder}>
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
