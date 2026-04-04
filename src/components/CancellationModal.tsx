import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useBookmarks } from "@/contexts/BookmarkContext";
import { tokens } from "@/theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  onProceed: () => void;
};

export function CancellationModal({ visible, onClose, onProceed }: Props) {
  const { bookmarkCount, notesCount } = useBookmarks();

  const stats = [
    {
      icon: "bookmark" as const,
      label: "Saved countries",
      value: bookmarkCount.toString(),
      color: tokens.color.gold,
    },
    {
      icon: "document-text" as const,
      label: "Move notes",
      value: notesCount.toString(),
      color: tokens.color.teal,
    },
    {
      icon: "git-compare" as const,
      label: "Compare access",
      value: "Full",
      color: tokens.color.primary,
    },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Ionicons name="warning" size={28} color={tokens.color.gold} />
            <Text style={styles.title}>Before you go...</Text>
          </View>

          <Text style={styles.body}>
            Canceling your subscription means you'll lose access to:
          </Text>

          <View style={styles.statsList}>
            {stats.map((s) => (
              <View key={s.label} style={styles.statRow}>
                <View style={[styles.statIcon, { backgroundColor: s.color + "20" }]}>
                  <Ionicons name={s.icon} size={16} color={s.color} />
                </View>
                <Text style={styles.statLabel}>{s.label}</Text>
                <Text style={styles.statValue}>{s.value}</Text>
              </View>
            ))}
          </View>

          <View style={styles.warningBox}>
            <Ionicons name="alert-circle" size={16} color="#b45309" />
            <Text style={styles.warningText}>
              Your saved countries and notes will become read-only. You won't be able to add new ones or access pro comparison factors.
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.keepBtn, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.keepBtnText}>Keep My Access</Text>
            </Pressable>

            <Pressable
              onPress={onProceed}
              style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.cancelBtnText}>Continue to Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: tokens.color.surface,
    borderRadius: tokens.radius.xl,
    padding: 28,
    width: "100%",
    maxWidth: 400,
    gap: 20,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  body: {
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 22,
  },
  statsList: {
    gap: 12,
  },
  statRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  statLabel: {
    flex: 1,
    fontSize: 15,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
  },
  statValue: {
    fontSize: 16,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
  },
  warningBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: "#fef3c7",
    borderRadius: tokens.radius.md,
    padding: 14,
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  warningText: {
    flex: 1,
    fontSize: 13,
    fontFamily: tokens.font.body,
    color: "#92400e",
    lineHeight: 18,
  },
  actions: {
    gap: 12,
  },
  keepBtn: {
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.md,
    paddingVertical: 16,
    alignItems: "center",
  },
  keepBtnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
  },
  cancelBtn: {
    alignItems: "center",
    paddingVertical: 12,
  },
  cancelBtnText: {
    color: tokens.color.subtext,
    fontSize: 14,
    fontFamily: tokens.font.body,
  },
});
