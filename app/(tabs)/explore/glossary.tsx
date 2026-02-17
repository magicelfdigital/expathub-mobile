import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { Screen } from "@/components/Screen";
import { GLOSSARY, GlossaryEntry } from "@/data/glossary";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

const COUNTRIES_ORDER = [
  "Canada",
  "Costa Rica",
  "Ecuador",
  "Malta",
  "Netherlands",
  "Panama",
  "Portugal",
  "Spain",
  "Thailand",
  "United Kingdom",
  "General",
];

function groupByCountry(entries: GlossaryEntry[]) {
  const groups: { country: string; items: GlossaryEntry[] }[] = [];
  const countryMap = new Map<string, GlossaryEntry[]>();

  for (const e of entries) {
    const list = countryMap.get(e.country) || [];
    list.push(e);
    countryMap.set(e.country, list);
  }

  for (const c of COUNTRIES_ORDER) {
    const items = countryMap.get(c);
    if (items && items.length > 0) groups.push({ country: c, items });
  }

  return groups;
}

export default function GlossaryScreen() {
  const [search, setSearch] = useState("");
  const [expandedAbbr, setExpandedAbbr] = useState<string | null>(null);

  const lowerSearch = search.toLowerCase().trim();
  const filtered = lowerSearch
    ? GLOSSARY.filter(
        (g) =>
          g.abbreviation.toLowerCase().includes(lowerSearch) ||
          g.fullName.toLowerCase().includes(lowerSearch) ||
          g.country.toLowerCase().includes(lowerSearch)
      )
    : GLOSSARY;

  const groups = groupByCountry(filtered);

  const toggle = (abbr: string) => {
    setExpandedAbbr((prev) => (prev === abbr ? null : abbr));
  };

  return (
    <Screen>
      <ScrollView
        style={s.container}
        contentContainerStyle={[
          s.content,
          Platform.OS === "web" && {
            paddingTop: WEB_TOP_INSET + tokens.space.xl,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.header}>
          <Text style={s.h1}>Visa Glossary</Text>
          <Text style={s.lead}>
            Common abbreviations you will see in immigration paperwork and on
            this app.
          </Text>
        </View>

        <View style={s.searchWrap}>
          <Ionicons
            name="search"
            size={16}
            color={tokens.color.subtext}
            style={s.searchIcon}
          />
          <TextInput
            style={s.searchInput}
            placeholder="Search abbreviations..."
            placeholderTextColor={tokens.color.subtext}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons
                name="close-circle"
                size={18}
                color={tokens.color.subtext}
              />
            </Pressable>
          )}
        </View>

        {groups.length === 0 && (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>
              No abbreviations match "{search}"
            </Text>
          </View>
        )}

        {groups.map((group) => (
          <View key={group.country} style={s.countrySection}>
            <View style={s.countryHeader}>
              <Ionicons
                name="flag-outline"
                size={14}
                color={tokens.color.primary}
              />
              <Text style={s.countryName}>{group.country}</Text>
            </View>

            <View style={s.entriesList}>
              {group.items.map((entry) => {
                const isOpen =
                  expandedAbbr ===
                  `${entry.country}-${entry.abbreviation}`;
                const entryKey = `${entry.country}-${entry.abbreviation}`;
                return (
                  <Pressable
                    key={entryKey}
                    onPress={() => toggle(entryKey)}
                    style={({ pressed }) => [
                      s.entryCard,
                      isOpen && s.entryCardOpen,
                      pressed && s.entryCardPressed,
                    ]}
                  >
                    <View style={s.entryRow}>
                      <View style={s.abbrBadge}>
                        <Text style={s.abbrText}>{entry.abbreviation}</Text>
                      </View>
                      <Text style={s.fullName} numberOfLines={isOpen ? undefined : 1}>
                        {entry.fullName}
                      </Text>
                      <Ionicons
                        name={isOpen ? "chevron-up" : "chevron-down"}
                        size={14}
                        color={tokens.color.subtext}
                      />
                    </View>
                    {isOpen && (
                      <Text style={s.description}>{entry.description}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

        <View style={s.footer}>
          <Text style={s.footerText}>
            {filtered.length} abbreviation{filtered.length !== 1 ? "s" : ""}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: {
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl + 40,
    gap: tokens.space.lg,
  },

  header: { gap: tokens.space.xs },
  h1: {
    fontSize: tokens.text.h1,
    fontWeight: tokens.weight.black as any,
    color: tokens.color.text,
  },
  lead: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "web" ? 10 : 8,
    gap: 8,
  },
  searchIcon: {},
  searchInput: {
    flex: 1,
    fontSize: tokens.text.body,
    color: tokens.color.text,
    padding: 0,
  },

  emptyWrap: {
    alignItems: "center",
    paddingVertical: tokens.space.xxl,
  },
  emptyText: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
  },

  countrySection: { gap: tokens.space.sm },
  countryHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  countryName: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.bold as any,
    color: tokens.color.text,
  },

  entriesList: { gap: 6 },

  entryCard: {
    padding: 12,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
    gap: 8,
  },
  entryCardOpen: {
    borderColor: tokens.color.primaryBorder,
    backgroundColor: tokens.color.primarySoft,
  },
  entryCardPressed: { opacity: 0.9 },

  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  abbrBadge: {
    backgroundColor: tokens.color.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    minWidth: 44,
    alignItems: "center",
  },
  abbrText: {
    fontSize: 13,
    fontWeight: tokens.weight.black as any,
    color: "#fff",
    letterSpacing: 0.5,
  },

  fullName: {
    flex: 1,
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.medium as any,
    color: tokens.color.text,
  },

  description: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
    lineHeight: 19,
    paddingLeft: 54,
  },

  footer: {
    alignItems: "center",
    paddingTop: tokens.space.md,
  },
  footerText: {
    fontSize: tokens.text.small,
    color: tokens.color.subtext,
  },
});
