import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { View } from "react-native";
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
import { Lora_600SemiBold } from "@expo-google-fonts/lora";
import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from "@expo-google-fonts/dm-sans";
import { initCrashlytics } from "@/utils/crashlytics";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F5F6FA' } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="subscribe/index" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="auth" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="account" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="about" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="country-view" options={{ headerShown: false }} />
      {__DEV__ && (
        <Stack.Screen name="debug-billing" options={{ headerShown: false, presentation: "modal" }} />
      )}
    </Stack>
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
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#F5F6FA' }}>
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
