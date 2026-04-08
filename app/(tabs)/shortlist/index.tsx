import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { useAuth } from "@/contexts/AuthContext";
import { useBookmarks } from "@/contexts/BookmarkContext";
import { useCountry } from "@/contexts/CountryContext";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { getCountry } from "@/src/data";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

function getCountryName(slug: string): string {
  return getCountry(slug)?.name ?? slug;
}

type BookmarkCardProps = {
  countrySlug: string;
  note: string;
  isPro: boolean;
  onRemove: () => void;
  onSaveNote: (content: string) => void;
  onNavigate: () => void;
  selected: boolean;
  onToggleSelect: () => void;
  showCompare: boolean;
};

function BookmarkCard({
  countrySlug,
  note,
  isPro,
  onRemove,
  onSaveNote,
  onNavigate,
  selected,
  onToggleSelect,
  showCompare,
}: BookmarkCardProps) {
  const [noteText, setNoteText] = useState(note);
  const [noteExpanded, setNoteExpanded] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const handleBlur = useCallback(() => {
    if (noteText !== note) {
      onSaveNote(noteText);
    }
  }, [noteText, note, onSaveNote]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        {showCompare ? (
          <Pressable onPress={onToggleSelect} hitSlop={8} style={styles.selectBtn}>
            <Ionicons
              name={selected ? "checkbox" : "square-outline"}
              size={22}
              color={selected ? tokens.color.teal : tokens.color.subtext}
            />
          </Pressable>
        ) : null}

        <Pressable onPress={onNavigate} style={styles.cardTitleArea}>
          <Text style={styles.cardName} numberOfLines={1}>
            {getCountryName(countrySlug)}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={tokens.color.subtext} />
        </Pressable>

        <Pressable onPress={onRemove} hitSlop={8}>
          <Ionicons name="close-circle-outline" size={22} color={tokens.color.subtext} />
        </Pressable>
      </View>

      {isPro ? (
        <View style={styles.noteSection}>
          <Pressable
            onPress={() => {
              setNoteExpanded(!noteExpanded);
              if (!noteExpanded) {
                setTimeout(() => inputRef.current?.focus(), 100);
              }
            }}
            style={styles.noteToggle}
          >
            <Ionicons
              name="document-text-outline"
              size={14}
              color={tokens.color.subtext}
            />
            <Text style={styles.noteToggleText}>
              {noteText.trim() ? "Edit notes" : "Add notes"}
            </Text>
            <Ionicons
              name={noteExpanded ? "chevron-up" : "chevron-down"}
              size={14}
              color={tokens.color.subtext}
            />
          </Pressable>

          {noteExpanded && (
            <TextInput
              ref={inputRef}
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              onBlur={handleBlur}
              placeholder="Your move notes for this country..."
              placeholderTextColor={tokens.color.subtext}
              multiline
              textAlignVertical="top"
            />
          )}

          {!noteExpanded && noteText.trim() ? (
            <Text style={styles.notePreview} numberOfLines={2}>
              {noteText.trim()}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.noteLocked}>
          <Ionicons name="lock-closed" size={12} color={tokens.color.primary} />
          <Text style={styles.noteLockedText}>
            Upgrade to add move notes
          </Text>
        </View>
      )}
    </View>
  );
}

export default function ShortlistScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { bookmarks, toggleBookmark, noteForCountry, saveNote } = useBookmarks();
  const { setSelectedCountrySlug } = useCountry();
  const { hasActiveSubscription } = useSubscription();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleToggleSelect = useCallback((slug: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else if (next.size < 3) {
        next.add(slug);
      }
      return next;
    });
  }, []);

  const handleCompare = useCallback(() => {
    if (selected.size < 2) {
      if (Platform.OS === "web") {
        window.alert("Select at least 2 countries to compare.");
      } else {
        Alert.alert("Select Countries", "Pick at least 2 countries to compare.");
      }
      return;
    }
    router.push(`/explore/compare?slugs=${Array.from(selected).join(",")}` as any);
  }, [selected, router]);

  const handleRemove = useCallback(
    async (slug: string) => {
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
      await toggleBookmark(slug);
    },
    [toggleBookmark]
  );

  if (!user) {
    return (
      <Screen>
        <View style={[styles.emptyContainer, { paddingTop: WEB_TOP_INSET + insets.top + 40 }]}>
          <Ionicons name="bookmark-outline" size={48} color={tokens.color.subtext} />
          <Text style={styles.emptyTitle}>Your Shortlist</Text>
          <Text style={styles.emptyText}>
            Sign in to save countries and track your relocation research.
          </Text>
          <Pressable
            onPress={() => router.push("/auth?mode=register" as any)}
            style={styles.emptyBtn}
          >
            <Text style={styles.emptyBtnText}>Sign In</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (bookmarks.length === 0) {
    return (
      <Screen>
        <View style={[styles.emptyContainer, { paddingTop: WEB_TOP_INSET + insets.top + 40 }]}>
          <Ionicons name="bookmark-outline" size={48} color={tokens.color.subtext} />
          <Text style={styles.emptyTitle}>No Saved Countries</Text>
          <Text style={styles.emptyText}>
            Tap the bookmark icon on any country to add it to your shortlist.
          </Text>
          <Pressable
            onPress={() => router.push("/(tabs)/(home)/countries" as any)}
            style={styles.emptyBtn}
          >
            <Text style={styles.emptyBtnText}>Browse Countries</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={bookmarks}
        keyExtractor={(item) => item.countrySlug}
        contentContainerStyle={[
          styles.listContent,
          { paddingTop: WEB_TOP_INSET + (Platform.OS === "web" ? 0 : insets.top) + 16 },
        ]}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Text style={styles.h1}>Your Shortlist</Text>
            <Text style={styles.subtitle}>
              {bookmarks.length} {bookmarks.length === 1 ? "country" : "countries"} saved
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <BookmarkCard
            countrySlug={item.countrySlug}
            note={noteForCountry(item.countrySlug)}
            isPro={hasActiveSubscription}
            onRemove={() => handleRemove(item.countrySlug)}
            onSaveNote={(content) => saveNote(item.countrySlug, content)}
            onNavigate={() => {
              setSelectedCountrySlug(item.countrySlug);
              router.push({ pathname: "/(tabs)/(home)/country/[slug]", params: { slug: item.countrySlug } } as any);
            }}
            selected={selected.has(item.countrySlug)}
            onToggleSelect={() => handleToggleSelect(item.countrySlug)}
            showCompare={bookmarks.length >= 2}
          />
        )}
        ListFooterComponent={
          bookmarks.length >= 2 ? (
            <Pressable
              onPress={handleCompare}
              style={({ pressed }) => [
                styles.compareBtn,
                selected.size < 2 && styles.compareBtnDisabled,
                pressed && { opacity: 0.9 },
              ]}
            >
              <Ionicons name="git-compare-outline" size={18} color="#fff" />
              <Text style={styles.compareBtnText}>
                Compare{selected.size >= 2 ? ` (${selected.size})` : ""}
              </Text>
            </Pressable>
          ) : null
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: {
    paddingHorizontal: tokens.space.xl,
    paddingBottom: 40,
  },
  listHeader: {
    marginBottom: 20,
  },
  h1: {
    fontSize: tokens.text.h1,
    fontWeight: "800",
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  subtitle: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    marginTop: 4,
  },

  card: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.color.border,
    marginBottom: 14,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  selectBtn: {},
  cardTitleArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardName: {
    flex: 1,
    fontSize: tokens.text.body,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },

  noteSection: {
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  noteToggleText: {
    flex: 1,
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
  },
  noteInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    padding: 12,
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    minHeight: 100,
    backgroundColor: tokens.color.bg,
  },
  notePreview: {
    marginTop: 6,
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 18,
  },
  noteLocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noteLockedText: {
    fontSize: 12,
    fontFamily: tokens.font.body,
    color: tokens.color.primary,
  },

  compareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: tokens.color.teal,
    paddingVertical: 16,
    borderRadius: tokens.radius.md,
    marginTop: 8,
  },
  compareBtnDisabled: {
    opacity: 0.5,
  },
  compareBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
  },

  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: "700",
    fontFamily: tokens.font.display,
    color: tokens.color.text,
    textAlign: "center",
  },
  emptyText: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyBtn: {
    backgroundColor: tokens.color.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: tokens.radius.md,
    marginTop: 8,
  },
  emptyBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
    fontFamily: tokens.font.bodySemiBold,
  },
});
