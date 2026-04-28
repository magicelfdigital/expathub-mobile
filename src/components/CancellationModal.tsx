import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useBookmarks } from "@/contexts/BookmarkContext";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/src/contexts/PlanContext";
import { getProgressPercent } from "@/src/lib/getProgressPercent";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";
import {
  getInitialCancellationStep,
  trackExitOfferAction,
} from "@/src/lib/conversionLifts";

type ExitOfferConfig = {
  eligible: boolean;
  subscriptionId?: string | null;
  onAccept: () => Promise<void> | void;
  onDecline?: () => Promise<void> | void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  onProceed: () => void;
  exitOffer?: ExitOfferConfig;
};

type Step = "exit_offer" | "before_you_go";

export function CancellationModal({ visible, onClose, onProceed, exitOffer }: Props) {
  const { bookmarkCount, notesCount } = useBookmarks();
  const { user } = useAuth();
  const { activeCountrySlug } = usePlan();
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!visible || !user?.id || !activeCountrySlug) {
      setProgressPercent(0);
      return;
    }
    getProgressPercent(String(user.id), activeCountrySlug).then((p) => {
      if (!cancelled) setProgressPercent(p);
    });
    return () => { cancelled = true; };
  }, [visible, user?.id, activeCountrySlug]);

  const initialStep: Step = getInitialCancellationStep(exitOffer);
  const [step, setStep] = useState<Step>(initialStep);
  const [busy, setBusy] = useState(false);
  const shownRef = React.useRef(false);

  useEffect(() => {
    if (!visible) {
      shownRef.current = false;
      return;
    }
    setStep(getInitialCancellationStep(exitOffer));
  }, [visible, exitOffer?.eligible]);

  useEffect(() => {
    if (!visible || step !== "exit_offer" || shownRef.current) return;
    shownRef.current = true;
    trackExitOfferAction("shown", {
      subscriptionId: exitOffer?.subscriptionId,
      trackEvent,
    });
  }, [visible, step, exitOffer?.subscriptionId]);

  const handleAcceptOffer = async () => {
    setBusy(true);
    try {
      await exitOffer?.onAccept();
      trackExitOfferAction("accept", {
        subscriptionId: exitOffer?.subscriptionId,
        trackEvent,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineOffer = async () => {
    setBusy(true);
    try {
      await exitOffer?.onDecline?.();
      trackExitOfferAction("decline", {
        subscriptionId: exitOffer?.subscriptionId,
        trackEvent,
      });
      setStep("before_you_go");
    } finally {
      setBusy(false);
    }
  };

  const stats = [
    { icon: "bookmark" as const, label: "Saved countries", value: bookmarkCount.toString(), color: tokens.color.gold },
    { icon: "document-text" as const, label: "Move notes", value: notesCount.toString(), color: tokens.color.teal },
    { icon: "git-compare" as const, label: "Compare access", value: "Full", color: tokens.color.primary },
    { icon: "trophy" as const, label: "Plan progress", value: `${progressPercent}%`, color: tokens.color.teal },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {step === "exit_offer" ? (
            <>
              <View style={styles.header}>
                <View style={[styles.iconCircle, { backgroundColor: tokens.color.goldLight }]}>
                  <Ionicons name="pricetag" size={26} color={tokens.color.gold} />
                </View>
                <Text style={styles.title}>Wait — 50% off your next 3 months?</Text>
              </View>

              <Text style={styles.body}>
                Before you cancel: keep ExpatHub Pro at half price for the next
                three billing periods. The discount is applied automatically.
                Cancel anytime.
              </Text>

              <View style={styles.statsList}>
                <View style={styles.bullet}>
                  <Ionicons name="checkmark-circle" size={16} color={tokens.color.primary} />
                  <Text style={styles.bulletText}>Keep saved countries and notes</Text>
                </View>
                <View style={styles.bullet}>
                  <Ionicons name="checkmark-circle" size={16} color={tokens.color.primary} />
                  <Text style={styles.bulletText}>Keep all comparison and Decision Brief access</Text>
                </View>
                <View style={styles.bullet}>
                  <Ionicons name="checkmark-circle" size={16} color={tokens.color.primary} />
                  <Text style={styles.bulletText}>No code needed — applied at next renewal</Text>
                </View>
              </View>

              <View style={styles.actions}>
                <Pressable
                  testID="exit-offer-accept"
                  onPress={handleAcceptOffer}
                  disabled={busy}
                  style={({ pressed }) => [styles.keepBtn, (pressed || busy) && { opacity: 0.85 }]}
                >
                  {busy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.keepBtnText}>Yes, keep me at 50% off</Text>
                  )}
                </Pressable>

                <Pressable
                  testID="exit-offer-decline"
                  onPress={handleDeclineOffer}
                  disabled={busy}
                  style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.cancelBtnText}>No thanks, continue to cancel</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
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
                  Your saved countries and notes will become read-only. You won't
                  be able to add new ones or access pro comparison factors.
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
            </>
          )}
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
    borderRadius: tokens.radius.lg,
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
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 21,
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
  statsList: { gap: 12 },
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
  bullet: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: tokens.font.body,
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
  actions: { gap: 12 },
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
