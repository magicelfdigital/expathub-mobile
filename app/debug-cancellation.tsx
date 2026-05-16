import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CancellationModal } from "@/src/components/CancellationModal";
import { tokens } from "@/theme/tokens";

if (!__DEV__) {
  throw new Error("Debug cancellation screen should never load in production");
}

export default function DebugCancellationScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [eligible, setEligible] = useState(true);
  const [acceptCalled, setAcceptCalled] = useState(false);
  const [proceedCalled, setProceedCalled] = useState(false);

  const WEB_TOP = Platform.OS === "web" ? 67 : 0;

  return (
    <View
      testID="debug-cancellation"
      style={[s.container, { paddingTop: (Platform.OS === "web" ? WEB_TOP : insets.top) + 16 }]}
    >
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="close" size={28} color={tokens.color.text} />
        </Pressable>
        <Text style={s.headerTitle}>Cancellation Modal Harness</Text>
        <View style={{ width: 28 }} />
      </View>

      <Text style={s.body}>
        Renders CancellationModal directly so end-to-end flows can drive it
        without a live subscription. Toggle eligibility and open the modal.
      </Text>

      <Pressable
        testID="debug-cancel-toggle-eligible"
        onPress={() => {
          setEligible((v) => !v);
          setAcceptCalled(false);
          setProceedCalled(false);
        }}
        style={s.button}
      >
        <Text style={s.buttonText}>
          exitOffer.eligible: {eligible ? "true" : "false"} (tap to toggle)
        </Text>
      </Pressable>

      <Pressable
        testID="debug-cancel-open"
        onPress={() => {
          setAcceptCalled(false);
          setProceedCalled(false);
          setVisible(true);
        }}
        style={[s.button, s.primary]}
      >
        <Text style={[s.buttonText, s.primaryText]}>Open Cancellation Modal</Text>
      </Pressable>

      <View style={s.statusCard}>
        <Text testID="debug-cancel-accept-status" style={s.status}>
          onAccept called: {acceptCalled ? "yes" : "no"}
        </Text>
        <Text testID="debug-cancel-proceed-status" style={s.status}>
          onProceed called: {proceedCalled ? "yes" : "no"}
        </Text>
        <Text testID="debug-cancel-modal-visible" style={s.status}>
          modal visible: {visible ? "yes" : "no"}
        </Text>
      </View>

      <CancellationModal
        visible={visible}
        onClose={() => setVisible(false)}
        onProceed={() => {
          setProceedCalled(true);
          setVisible(false);
        }}
        exitOffer={{
          eligible,
          subscriptionId: "debug_sub_123",
          onAccept: () => {
            setAcceptCalled(true);
          },
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.color.bg,
    paddingHorizontal: 16,
    gap: 14,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "700",
    fontFamily: tokens.font.display,
    color: tokens.color.text,
  },
  body: {
    fontSize: 14,
    fontFamily: tokens.font.body,
    color: tokens.color.subtext,
    lineHeight: 20,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.color.border,
    backgroundColor: tokens.color.surface,
  },
  primary: {
    backgroundColor: tokens.color.primary,
    borderColor: tokens.color.primary,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    textAlign: "center",
  },
  primaryText: {
    color: "#fff",
  },
  statusCard: {
    padding: 14,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    gap: 6,
  },
  status: {
    fontSize: 13,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    color: tokens.color.text,
  },
});
