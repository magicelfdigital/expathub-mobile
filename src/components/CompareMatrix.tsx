import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useSubscription } from "@/contexts/SubscriptionContext";
import { getCompareMatrix, type CompareRow } from "@/src/data/compareMatrix";
import { getCountry } from "@/src/data";
import { trackEvent } from "@/src/lib/analytics";
import { tokens } from "@/theme/tokens";

type Props = {
  countrySlugs: string[];
  onRemoveCountry?: (slug: string) => void;
  onAddCountry?: () => void;
  maxCountries?: number;
};

function CountryHeader({
  slug,
  onRemove,
}: {
  slug: string;
  onRemove?: () => void;
}) {
  const name = getCountry(slug)?.name ?? slug;
  return (
    <View style={s.colHeader}>
      <Text style={s.colHeaderText} numberOfLines={1}>
        {name}
      </Text>
      {onRemove && (
        <Pressable onPress={onRemove} hitSlop={8} style={s.removeBtn}>
          <Ionicons name="close" size={12} color={tokens.color.subtext} />
        </Pressable>
      )}
    </View>
  );
}

function MatrixRow({
  row,
  slugs,
  isPro,
}: {
  row: CompareRow;
  slugs: string[];
  isPro: boolean;
}) {
  const locked = row.proOnly && !isPro;

  return (
    <View style={s.row}>
      <View style={s.labelCell}>
        <Text style={s.labelText}>{row.label}</Text>
        {row.proOnly && (
          <View style={s.proBadge}>
            <Text style={s.proBadgeText}>PRO</Text>
          </View>
        )}
      </View>

      {slugs.map((slug) => (
        <View key={slug} style={s.valueCell}>
          {locked ? (
            <View style={s.lockedContent}>
              <View style={s.blurredLines}>
                <View style={s.blurLine1} />
                <View style={s.blurLine2} />
                <View style={s.blurLine3} />
              </View>
              <View style={s.lockRow}>
                <Ionicons name="lock-closed" size={10} color={tokens.color.primary} />
                <Text style={s.lockText}>Decision Access</Text>
              </View>
            </View>
          ) : (
            <Text style={s.valueText}>{row.values[slug] ?? "\u2014"}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

export function CompareMatrix({
  countrySlugs,
  onRemoveCountry,
  onAddCountry,
  maxCountries = 3,
}: Props) {
  const { hasActiveSubscription } = useSubscription();
  const rows = useMemo(() => getCompareMatrix(countrySlugs), [countrySlugs]);
  const compareStartedRef = useRef(false);
  const viewedRowsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (countrySlugs.length > 0 && !compareStartedRef.current) {
      trackEvent("compare_started");
      compareStartedRef.current = true;
    }
  }, [countrySlugs]);

  useEffect(() => {
    if (countrySlugs.length === 0) return;
    for (const row of rows) {
      if (!viewedRowsRef.current.has(row.id)) {
        viewedRowsRef.current.add(row.id);
        trackEvent("compare_row_viewed", {
          rowId: row.id,
          countrySlugs: countrySlugs.join(","),
        });
      }
    }
  }, [rows, countrySlugs]);

  if (countrySlugs.length === 0) {
    return (
      <View style={s.emptyState}>
        <Ionicons name="git-compare-outline" size={32} color={tokens.color.subtext} />
        <Text style={s.emptyText}>
          Select countries above to compare side by side
        </Text>
      </View>
    );
  }

  const canAdd = countrySlugs.length < maxCountries;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.scrollOuter}
      contentContainerStyle={s.scrollContent}
    >
      <View style={s.table}>
        <View style={s.headerRow}>
          <View style={s.labelCell}>
            <Text style={s.cornerText}>Factor</Text>
          </View>
          {countrySlugs.map((slug) => (
            <CountryHeader
              key={slug}
              slug={slug}
              onRemove={onRemoveCountry ? () => onRemoveCountry(slug) : undefined}
            />
          ))}
          {canAdd && onAddCountry && (
            <Pressable onPress={onAddCountry} style={s.addCol}>
              <Ionicons name="add-circle-outline" size={18} color={tokens.color.primary} />
              <Text style={s.addColText}>Add</Text>
            </Pressable>
          )}
        </View>

        {rows.map((row, idx) => (
          <React.Fragment key={row.id}>
            {idx > 0 && <View style={s.rowDivider} />}
            <MatrixRow
              row={row}
              slugs={countrySlugs}
              isPro={hasActiveSubscription}
            />
          </React.Fragment>
        ))}

        {!hasActiveSubscription && (
          <View style={s.proFooter}>
            <Ionicons name="lock-closed" size={14} color={tokens.color.primary} />
            <Text style={s.proFooterText}>
              Unlock 5 more factors with ExpatHub Pro
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const COL_WIDTH = 170;
const LABEL_WIDTH = 130;

const s = {
  scrollOuter: { flex: 1 },
  scrollContent: { paddingBottom: 4 },

  table: {
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.color.surface,
    overflow: "hidden" as const,
  },

  headerRow: {
    flexDirection: "row" as const,
    backgroundColor: tokens.color.bg,
    borderBottomWidth: 1,
    borderBottomColor: tokens.color.border,
  },

  colHeader: {
    width: COL_WIDTH,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
  },

  colHeaderText: {
    flex: 1,
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
  },

  removeBtn: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: tokens.color.border,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  addCol: {
    width: 64,
    paddingVertical: 10,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 2,
  },

  addColText: {
    fontSize: 10,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
  },

  cornerText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.subtext,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },

  row: {
    flexDirection: "row" as const,
  },

  rowDivider: {
    height: 1,
    backgroundColor: tokens.color.border,
  },

  labelCell: {
    width: LABEL_WIDTH,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: tokens.color.bg,
    borderRightWidth: 1,
    borderRightColor: tokens.color.border,
    gap: 4,
  },

  labelText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.text,
    lineHeight: 16,
  },

  proBadge: {
    alignSelf: "flex-start" as const,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: tokens.color.primarySoft,
  },

  proBadgeText: {
    fontSize: 8,
    fontWeight: tokens.weight.black,
    color: tokens.color.primary,
    letterSpacing: 0.5,
  },

  valueCell: {
    width: COL_WIDTH,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },

  valueText: {
    fontSize: tokens.text.small,
    color: tokens.color.text,
    lineHeight: 17,
  },

  lockedContent: {
    gap: 6,
  },

  blurredLines: {
    gap: 4,
  },

  blurLine1: {
    height: 8,
    width: "90%" as const,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.06)",
  },

  blurLine2: {
    height: 8,
    width: "70%" as const,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.05)",
  },

  blurLine3: {
    height: 8,
    width: "50%" as const,
    borderRadius: 4,
    backgroundColor: "rgba(0,0,0,0.04)",
  },

  lockRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 3,
  },

  lockText: {
    fontSize: 10,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
  },

  proFooter: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: tokens.color.border,
    backgroundColor: tokens.color.primarySoft,
  },

  proFooterText: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    color: tokens.color.primary,
  },

  emptyState: {
    paddingVertical: 40,
    alignItems: "center" as const,
    gap: 10,
  },

  emptyText: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    textAlign: "center" as const,
  },
} as const;
