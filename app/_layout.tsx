import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { logCrash } from "@/utils/crashlytics";
import { queryClient } from "@/lib/query-client";
import { CountryProvider } from "@/contexts/CountryContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { PlanProvider } from "@/src/contexts/PlanContext";
import { SavedProvider } from "@/src/contexts/SavedContext";
import { ContinueProvider } from "@/src/contexts/ContinueContext";
import { BookmarkProvider } from "@/contexts/BookmarkContext";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { Lora_600SemiBold } from "@expo-google-fonts/lora";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { initCrashlytics } from "@/utils/crashlytics";
import { tokens } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync();

function OnboardingGate() {
  const { hasSeenOnboarding } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (hasSeenOnboarding === null) return;

    const inOnboarding = segments[0] === "onboarding";

    if (!hasSeenOnboarding && !inOnboarding) {
      router.replace("/onboarding/intro");
    }
  }, [hasSeenOnboarding, segments, router]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <OnboardingGate />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="subscribe/index" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="auth" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="account" options={{ headerShown: false, presentation: "modal" }} />
        <Stack.Screen name="about" options={{ headerShown: false, presentation: "modal" }} />

        {__DEV__ && (
          <Stack.Screen name="debug-billing" options={{ headerShown: false, presentation: "modal" }} />
        )}
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
    Lora_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    initCrashlytics();
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ErrorBoundary onError={(error) => { logCrash(error); }}>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
          <KeyboardProvider>
            <AuthProvider>
              <OnboardingProvider>
                <CountryProvider>
                  <SubscriptionProvider>
                    <BookmarkProvider>
                      <PlanProvider>
                        <ContinueProvider>
                          <SavedProvider>
                            <RootLayoutNav />
                          </SavedProvider>
                        </ContinueProvider>
                      </PlanProvider>
                    </BookmarkProvider>
                  </SubscriptionProvider>
                </CountryProvider>
              </OnboardingProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
