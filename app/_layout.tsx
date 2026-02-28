import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { CountryProvider } from "@/contexts/CountryContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { PlanProvider } from "@/src/contexts/PlanContext";
import { SavedProvider } from "@/src/contexts/SavedContext";
import { ContinueProvider } from "@/src/contexts/ContinueContext";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { initCrashlytics } from "@/utils/crashlytics";
import { tokens } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="subscribe/index" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="auth" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="account" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="country-view" options={{ headerShown: false }} />
      {__DEV__ && (
        <Stack.Screen name="debug-billing" options={{ headerShown: false, presentation: "modal" }} />
      )}
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...Feather.font,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  useEffect(() => {
    initCrashlytics();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
          <KeyboardProvider>
            <AuthProvider>
              <CountryProvider>
                <SubscriptionProvider>
                  <PlanProvider>
                    <ContinueProvider>
                      <SavedProvider>
                        <RootLayoutNav />
                      </SavedProvider>
                    </ContinueProvider>
                  </PlanProvider>
                </SubscriptionProvider>
              </CountryProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
