import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { Screen } from "@/components/Screen";
import { CompareMatrix } from "@/src/components/CompareMatrix";
import { getCompareCountrySlugs, getCountries } from "@/src/data";
import { trackEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";

const WEB_TOP_INSET = Platform.OS === "web" ? 67 : 0;

const COMPARE_PRESETS = [
  { label: "Europe", slugs: ["portugal", "spain", "malta"] },
  { label: "Americas", slugs: ["costa-rica", "panama", "ecuador"] },
  { label: "English-speaking", slugs: ["canada", "united-kingdom", "malta"] },
];

export default function CompareScreen() {
  const compareStartedRef = useRef(false);

  useEffect(() => {
    if (!compareStartedRef.current) {
      trackEvent("compare_started");
      compareStartedRef.current = true;
    }
  }, []);

  const [compareSlugs, setCompareSlugs] = useState<string[]>(["portugal", "spain"]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const allCountries = useMemo(() => getCountries(), []);
  const comparableSlugs = useMemo(() => getCompareCountrySlugs(), []);

  const availableCountries = useMemo(() => {
    return comparableSlugs
      .filter((s) => !compareSlugs.includes(s))
      .map((slug) => {
        const c = allCountries.find((co) => co.slug === slug);
        return { slug, name: c?.name ?? slug };
      });
  }, [compareSlugs, comparableSlugs, allCountries]);

  const handleAddCountry = useCallback(() => {
    setPickerOpen(true);
  }, []);

  const handleRemoveCountry = useCallback((slug: string) => {
    setCompareSlugs((prev) => prev.filter((s) => s !== slug));
  }, []);

  const handlePickCountry = useCallback((slug: string) => {
    setCompareSlugs((prev) => {
      if (prev.length >= 3) return prev;
      if (prev.includes(slug)) return prev;
      return [...prev, slug];
    });
    setPickerOpen(false);
  }, []);

  const handlePreset = useCallback((slugs: string[]) => {
    setCompareSlugs(slugs);
  }, []);

  return (
    <Screen>
      <ScrollView
        style={s.container}
        contentContainerStyle={[
          s.content,
          Platform.OS === "web" && { paddingTop: WEB_TOP_INSET + tokens.space.xl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.header}>
          <Text style={s.h1}>Compare Countries</Text>
          <Text style={s.lead}>
            Pick up to 3 countries. Free rows show at a glance; Pro rows reveal the nuanced details.
          </Text>
        </View>

        <View style={s.presetSection}>
          <Text style={s.presetLabel}>Quick presets</Text>
          <View style={s.presetRow}>
            {COMPARE_PRESETS.map((p) => {
              const active =
                JSON.stringify(compareSlugs.slice().sort()) ===
                JSON.stringify(p.slugs.slice().sort());
              return (
                <Pressable
                  key={p.label}
                  onPress={() => handlePreset(p.slugs)}
                  style={[s.presetChip, active && s.presetChipActive]}
                >
                  <Text
                    style={[
                      s.presetChipText,
                      active && s.presetChipTextActive,
                    ]}
                  >
                    {p.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <CompareMatrix
          countrySlugs={compareSlugs}
          onRemoveCountry={handleRemoveCountry}
          onAddCountry={compareSlugs.length < 3 ? handleAddCountry : undefined}
          maxCountries={3}
        />
      </ScrollView>

      <Modal visible={pickerOpen} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <Pressable style={s.modalBackdrop} onPress={() => setPickerOpen(false)} />
          <View style={s.modalSheet}>
            <View style={s.modalHandleRow}>
              <View style={s.modalHandle} />
            </View>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Add a country</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={22} color={tokens.color.subtext} />
              </Pressable>
            </View>
            <FlatList
              data={availableCountries}
              keyExtractor={(item) => item.slug}
              style={s.modalList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => handlePickCountry(item.slug)}
                  style={({ pressed }) => [
                    s.modalRow,
                    pressed && s.modalRowPressed,
                  ]}
                  testID={`pick-country-${item.slug}`}
                >
                  <Text style={s.modalRowName}>{item.name}</Text>
                  <View style={s.addBtnCircle}>
                    <Ionicons name="add" size={16} color={tokens.color.white} />
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={s.emptyPicker}>
                  <Text style={s.emptyPickerText}>
                    All available countries are already selected.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: tokens.color.bg },
  content: {
    padding: tokens.space.xl,
    paddingBottom: tokens.space.xxl,
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

  presetSection: { gap: 8 },
  presetLabel: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold as any,
    color: tokens.color.subtext,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  presetChipActive: {
    borderColor: tokens.color.primary,
    backgroundColor: tokens.color.primarySoft,
  },
  presetChipText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold as any,
    color: tokens.color.subtext,
  },
  presetChipTextActive: {
    color: tokens.color.primary,
  },

  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  modalSheet: {
    backgroundColor: tokens.color.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: Platform.OS === "web" ? 34 : 40,
    height: Math.round(Dimensions.get("window").height * 0.6),
  },
  modalHandleRow: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 8,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: tokens.color.border,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: tokens.space.xl,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  modalTitle: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black as any,
    color: tokens.color.text,
  },
  modalList: {
    flexGrow: 1,
    flexShrink: 1,
    paddingHorizontal: tokens.space.xl,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },
  modalRowPressed: { opacity: 0.6 },
  modalRowName: {
    fontSize: tokens.text.body,
    fontWeight: tokens.weight.bold as any,
    color: tokens.color.text,
  },
  addBtnCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: tokens.color.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPicker: {
    paddingVertical: 32,
    alignItems: "center",
  },
  emptyPickerText: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    textAlign: "center",
  },
});
