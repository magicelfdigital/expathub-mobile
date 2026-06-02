import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@/theme/tokens";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";

import { useEntitlement } from "@/src/contexts/EntitlementContext";

function AppHeaderTitle() {
  return (
    <Image
      source={require("../../../../../assets/brand/fulllogo_transparent_nobuffer no_tag.png")}
      resizeMode="contain"
      style={{ height: 32, width: 180 }}
    />
  );
}

function BackButton({ fallback }: { fallback?: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else if (fallback) {
          router.navigate(fallback as any);
        } else {
          router.navigate("/(tabs)" as any);
        }
      }}
      hitSlop={12}
      style={{ paddingVertical: 8, paddingRight: 8, paddingLeft: 16 }}
    >
      <Ionicons name="chevron-back" size={24} color={tokens.color.primary} />
    </Pressable>
  );
}

function HomeButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        router.navigate("/(tabs)" as any);
      }}
      hitSlop={12}
      style={{ paddingVertical: 8, paddingRight: 8, paddingLeft: 16 }}
    >
      <Ionicons name="chevron-back" size={24} color={tokens.color.primary} />
    </Pressable>
  );
}

function CountryBackButton() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else if (slug) {
          router.replace({ pathname: "/(tabs)/(home)/country/[slug]" as any, params: { slug } });
        } else {
          router.replace("/(tabs)" as any);
        }
      }}
      hitSlop={12}
      style={{ paddingVertical: 8, paddingRight: 8, paddingLeft: 16 }}
    >
      <Ionicons name="chevron-back" size={24} color={tokens.color.primary} />
    </Pressable>
  );
}

function HeaderBackground() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: tokens.color.bg,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.border,
      }}
    />
  );
}

function PathfinderBadge() {
  const { hasProAccess } = useEntitlement();
  if (hasProAccess) return null;
  return (
    <Text
      style={{
        color: tokens.color.gold,
        fontSize: 12,
        fontFamily: tokens.font.bodySemiBold,
      }}
    >
      Pathfinder
    </Text>
  );
}

export default function CountrySlugLayout() {
  const { hasProAccess } = useEntitlement();

  // Only attach a headerRight when there is something to show. For subscribers
  // PathfinderBadge renders nothing, but passing a headerRight that returns null
  // still makes the native iOS stack allocate an empty header button — which
  // modern iOS draws as a blank circular background in the top-right corner.
  // Leaving headerRight undefined avoids that empty white circle.
  const detailScreenOptions = {
    title: "",
    headerBackTitle: "",
    headerLeft: () => <CountryBackButton />,
    headerRight: hasProAccess ? undefined : () => <PathfinderBadge />,
    headerRightContainerStyle: { paddingRight: 12, backgroundColor: "transparent" },
  };

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: () => <AppHeaderTitle />,
        headerTitleAlign: "center",
        headerBackTitle: "",
        headerShadowVisible: false,
        headerBackground: () => <HeaderBackground />,
        headerLeft: () => <BackButton />,
        title: "",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <HomeButton />,
          title: "",
          headerBackTitle: "",
        }}
      />
      <Stack.Screen name="resources" options={detailScreenOptions} />
      <Stack.Screen name="vendors" options={detailScreenOptions} />
      <Stack.Screen name="community" options={detailScreenOptions} />
      <Stack.Screen name="saved" options={detailScreenOptions} />
      <Stack.Screen name="planner" options={detailScreenOptions} />
      <Stack.Screen name="pathways/[key]" options={detailScreenOptions} />
      <Stack.Screen name="pathways/passport-notes" options={detailScreenOptions} />
    </Stack>
  );
}
