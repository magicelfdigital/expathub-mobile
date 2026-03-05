import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Screen } from "@/components/Screen";
import { getApiUrl } from "@/lib/query-client";
import { tokens } from "@/theme/tokens";
import { trackEvent } from "@/src/lib/analytics";

const EXTERNAL_BASE = "https://www.expathub.website";

function getForgotPasswordUrl(): string {
  if (Platform.OS === "web") {
    try {
      return `${getApiUrl().replace(/\/$/, "")}/api/auth/forgot-password`;
    } catch {
      return `${EXTERNAL_BASE}/api/auth/forgot-password`;
    }
  }
  return `${EXTERNAL_BASE}/api/auth/forgot-password`;
}

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const WEB_TOP = Platform.OS === "web" ? 67 : 0;
  const canSubmit = email.trim().length > 0 && email.includes("@");

  React.useEffect(() => {
    trackEvent("password_reset_opened", { platform: Platform.OS });
  }, []);

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    trackEvent("password_reset_submitted", { platform: Platform.OS });
    try {
      const res = await fetch(getForgotPasswordUrl(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "We couldn't send the reset email. Please try again.");
      }
      setSubmitted(true);
      trackEvent("password_reset_success", { platform: Platform.OS });
    } catch (err: any) {
      const msg = err?.message || "We couldn't send the reset email. Please try again.";
      setError(msg);
      trackEvent("password_reset_error", { platform: Platform.OS });
      if (Platform.OS !== "web") {
        Alert.alert("Error", msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/auth?mode=login" as any);
    }
  };

  return (
    <Screen>
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: (Platform.OS === "web" ? WEB_TOP : insets.top) + 20 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Pressable onPress={handleBack} hitSlop={12} style={s.backBtn}>
          <Ionicons name="arrow-back" size={24} color={tokens.color.onDark} />
        </Pressable>

        <View style={s.logoWrap}>
          <Image
            source={require("../assets/brand/fulllogo_transparent_nobuffer.png")}
            resizeMode="contain"
            style={s.logo}
          />
        </View>

        {!submitted ? (
          <>
            <Text style={s.heading}>Reset password</Text>
            <Text style={s.subtitle}>
              We'll email you a link to reset your password.
            </Text>

            <View style={s.form}>
              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={(t) => { setEmail(t); setError(null); }}
                placeholder="you@example.com"
                placeholderTextColor={tokens.color.textSoft}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                editable={!busy}
                returnKeyType="send"
                onSubmitEditing={handleSubmit}
                testID="forgot-email"
              />

              {error && Platform.OS === "web" ? (
                <Text style={s.errorText}>{error}</Text>
              ) : null}

              <Pressable
                onPress={handleSubmit}
                disabled={!canSubmit || busy}
                style={[s.submitBtn, (!canSubmit || busy) && s.submitBtnDisabled]}
                testID="forgot-submit"
              >
                {busy ? (
                  <ActivityIndicator color={tokens.color.white} size="small" />
                ) : (
                  <Text style={s.submitText}>Send reset link</Text>
                )}
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={s.successIcon}>
              <Ionicons name="checkmark-circle" size={56} color={tokens.color.primary} />
            </View>

            <Text style={s.heading}>Check your email</Text>
            <Text style={s.subtitle}>
              If an account exists for that email, you'll receive a reset link shortly.
            </Text>

            <View style={s.infoBox}>
              <Ionicons name="information-circle" size={20} color={tokens.color.primary} />
              <Text style={s.infoText}>
                After resetting your password in the browser, return here to sign in.
              </Text>
            </View>

            <Pressable
              onPress={handleBack}
              style={s.submitBtn}
              testID="forgot-back-to-login"
            >
              <Text style={s.submitText}>Back to Sign In</Text>
            </Pressable>
          </>
        )}

        {!submitted ? (
          <Pressable onPress={handleBack} hitSlop={12} style={s.toggleWrap}>
            <Text style={s.toggleText}>
              Back to{" "}
              <Text style={s.toggleLink}>Sign In</Text>
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
    </Screen>
  );
}

const s = {
  flex: { flex: 1 } as const,
  scroll: { flex: 1 } as const,
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 60,
  } as const,

  backBtn: {
    marginBottom: 16,
    width: 40,
  } as const,

  logoWrap: { alignItems: "center" as const, marginBottom: 32 },
  logo: { height: 56, width: 240 },

  heading: {
    fontSize: 28,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.display,
    color: tokens.color.onDark,
    marginBottom: 8,
  } as const,

  subtitle: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.onDarkMid,
    lineHeight: 22,
    marginBottom: 24,
  } as const,

  successIcon: {
    alignItems: "center" as const,
    marginBottom: 20,
  } as const,

  infoBox: {
    ...tokens.card,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 10,
    padding: 14,
    marginBottom: 20,
  } as const,

  infoText: {
    flex: 1,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
    lineHeight: 20,
  } as const,

  form: {
    ...tokens.card,
    padding: 20,
    gap: 4,
  } as const,

  label: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.text,
    marginBottom: 4,
    marginTop: 12,
  } as const,

  input: {
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.text,
  } as const,

  errorText: {
    fontSize: tokens.text.small,
    fontFamily: tokens.font.body,
    color: "#fca5a5",
    marginTop: 8,
  } as const,

  submitBtn: {
    marginTop: 24,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.lg,
    paddingVertical: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    flexDirection: "row" as const,
  } as const,

  submitBtnDisabled: { opacity: 0.5 } as const,

  submitText: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    fontFamily: tokens.font.bodyBold,
    color: tokens.color.white,
  } as const,

  toggleWrap: {
    marginTop: 24,
    alignItems: "center" as const,
  } as const,

  toggleText: {
    fontSize: tokens.text.body,
    fontFamily: tokens.font.body,
    color: tokens.color.onDarkMid,
  } as const,

  toggleLink: {
    color: tokens.color.teal,
    fontWeight: tokens.weight.bold,
    fontFamily: tokens.font.bodyBold,
  } as const,
} as const;
