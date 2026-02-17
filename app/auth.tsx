import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
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

import { useAuth } from "@/contexts/AuthContext";
import { tokens } from "@/theme/tokens";

type Mode = "login" | "register";

export default function AuthScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const WEB_TOP = Platform.OS === "web" ? 67 : 0;

  const canSubmit =
    email.trim().length > 0 &&
    password.length >= 6 &&
    (mode === "login" || password === confirmPassword);

  const handleSubmit = async () => {
    if (!canSubmit || busy) return;
    setError(null);
    setBusy(true);

    try {
      if (mode === "register") {
        await register(email.trim().toLowerCase(), password);
      } else {
        await login(email.trim().toLowerCase(), password);
      }
      console.log("[AUTH] Auth success, dismissing modal");
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace("/(tabs)" as any);
      }
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const toggleMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"));
    setError(null);
    setConfirmPassword("");
  };

  return (
    <KeyboardAvoidingView
      style={s.flex}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={s.scroll}
        contentContainerStyle={[
          s.scrollContent,
          { paddingTop: (Platform.OS === "web" ? WEB_TOP : insets.top) + 40 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.logoWrap}>
          <Image
            source={require("../assets/brand/fulllogo_transparent_nobuffer.png")}
            resizeMode="contain"
            style={s.logo}
          />
        </View>

        <Text style={s.heading}>
          {mode === "login" ? "Welcome back" : "Create your account"}
        </Text>
        <Text style={s.subtitle}>
          {mode === "login"
            ? "Sign in to access your saved countries and Pro subscription"
            : "Sign up to sync your progress across devices"}
        </Text>

        {error ? (
          <View style={s.errorBox}>
            <Ionicons name="alert-circle" size={16} color="#b91c1c" />
            <Text style={s.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={s.form}>
          <Text style={s.label}>Email</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor="rgba(11,18,32,0.3)"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            editable={!busy}
            testID="auth-email"
          />

          <Text style={s.label}>Password</Text>
          <View style={s.passwordRow}>
            <TextInput
              style={s.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              placeholderTextColor="rgba(11,18,32,0.3)"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              textContentType={mode === "register" ? "newPassword" : "password"}
              editable={!busy}
              testID="auth-password"
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} style={s.eyeBtn}>
              <Ionicons name={showPassword ? "eye-off" : "eye"} size={20} color={tokens.color.subtext} />
            </Pressable>
          </View>

          {mode === "register" ? (
            <>
              <Text style={s.label}>Confirm Password</Text>
              <TextInput
                style={s.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter your password"
                placeholderTextColor="rgba(11,18,32,0.3)"
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="new-password"
                textContentType="newPassword"
                editable={!busy}
                testID="auth-confirm-password"
              />
              {confirmPassword.length > 0 && password !== confirmPassword ? (
                <Text style={s.fieldError}>Passwords don't match</Text>
              ) : null}
            </>
          ) : null}

          <Pressable
            onPress={handleSubmit}
            disabled={!canSubmit || busy}
            style={[s.submitBtn, (!canSubmit || busy) && s.submitBtnDisabled]}
            testID="auth-submit"
          >
            {busy ? (
              <ActivityIndicator color={tokens.color.white} size="small" />
            ) : (
              <Text style={s.submitText}>
                {mode === "login" ? "Sign In" : "Create Account"}
              </Text>
            )}
          </Pressable>
        </View>

        <Pressable onPress={toggleMode} hitSlop={12} style={s.toggleWrap}>
          <Text style={s.toggleText}>
            {mode === "login"
              ? "Don't have an account? "
              : "Already have an account? "}
            <Text style={s.toggleLink}>
              {mode === "login" ? "Sign Up" : "Sign In"}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = {
  flex: { flex: 1, backgroundColor: tokens.color.bg } as const,
  scroll: { flex: 1, backgroundColor: tokens.color.bg } as const,
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 60,
  } as const,

  logoWrap: { alignItems: "center" as const, marginBottom: 32 },
  logo: { height: 56, width: 240 },

  heading: {
    fontSize: 28,
    fontWeight: tokens.weight.black,
    color: tokens.color.text,
    marginBottom: 8,
  } as const,

  subtitle: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
    lineHeight: 22,
    marginBottom: 24,
  } as const,

  errorBox: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: tokens.radius.md,
    padding: 12,
    marginBottom: 16,
  } as const,

  errorText: {
    flex: 1,
    fontSize: tokens.text.body,
    color: "#b91c1c",
    lineHeight: 20,
  } as const,

  form: { gap: 4 } as const,

  label: {
    fontSize: tokens.text.small,
    fontWeight: tokens.weight.bold,
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
    color: tokens.color.text,
  } as const,

  passwordRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: tokens.color.surface,
    borderWidth: 1,
    borderColor: tokens.color.border,
    borderRadius: tokens.radius.md,
  } as const,

  passwordInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: tokens.text.body,
    color: tokens.color.text,
  } as const,

  eyeBtn: { paddingHorizontal: 12, paddingVertical: 10 } as const,

  fieldError: {
    fontSize: tokens.text.small,
    color: "#b91c1c",
    marginTop: 4,
  } as const,

  submitBtn: {
    marginTop: 24,
    backgroundColor: tokens.color.primary,
    borderRadius: tokens.radius.lg,
    paddingVertical: 16,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  } as const,

  submitBtnDisabled: { opacity: 0.5 } as const,

  submitText: {
    fontSize: tokens.text.h3,
    fontWeight: tokens.weight.black,
    color: tokens.color.white,
  } as const,

  toggleWrap: {
    marginTop: 24,
    alignItems: "center" as const,
  } as const,

  toggleText: {
    fontSize: tokens.text.body,
    color: tokens.color.subtext,
  } as const,

  toggleLink: {
    color: tokens.color.primary,
    fontWeight: tokens.weight.bold,
  } as const,
} as const;
