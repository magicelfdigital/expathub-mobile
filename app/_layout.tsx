import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { Platform } from "react-native";

import Purchases, { LOG_LEVEL } from "react-native-purchases";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { CountryProvider } from "@/contexts/CountryContext";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { Ionicons, Feather } from "@expo/vector-icons";
import { useFonts } from "expo-font";
import { initCrashlytics } from "@/utils/crashlytics";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="subscribe/index" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="auth" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="account" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="account-info" options={{ headerShown: false, presentation: "modal" }} />
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

  useEffect(() => {
    const initRevenueCat = async () => {
      try {
        Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        const apiKey =
          Platform.OS === "android"
            ? process.env.EXPO_PUBLIC_RC_ANDROID_API_KEY
            : process.env.EXPO_PUBLIC_RC_IOS_API_KEY;

        if (!apiKey) {
          console.warn(
            `[RevenueCat] Missing API key for ${Platform.OS}. Set EXPO_PUBLIC_RC_ANDROID_API_KEY / EXPO_PUBLIC_RC_IOS_API_KEY`
          );
          return;
        }

        await Purchases.configure({ apiKey });

        // Optional sanity check (leave commented until products are mapped in RC)
        // const offerings = await Purchases.getOfferings();
        // console.log("[RevenueCat] offerings:", Object.keys(offerings.all || {}));
      } catch (e: any) {
        console.error("[RevenueCat] init failed:", e?.message || e);
      }
    };

    initRevenueCat();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <GestureHandlerRootView>
          <KeyboardProvider>
            <AuthProvider>
              <CountryProvider>
                <SubscriptionProvider>
                  <RootLayoutNav />
                </SubscriptionProvider>
              </CountryProvider>
            </AuthProvider>
          </KeyboardProvider>
        </GestureHandlerRootView>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
