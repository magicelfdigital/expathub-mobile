import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@/theme/tokens";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import React from "react";
import { Image, Pressable } from "react-native";

function AppHeaderTitle() {
  return (
    <Image
      source={require("../../../../assets/brand/fulllogo_transparent_nobuffer no_tag.png")}
      resizeMode="contain"
      style={{ height: 28, width: 160 }}
    />
  );
}

function BackButton({ fallback }: { fallback?: string }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        if (fallback) {
          router.replace(fallback as any);
        } else if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)" as any);
        }
      }}
      hitSlop={12}
      style={{ padding: 8 }}
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
          router.replace({ pathname: "/(tabs)/country/[slug]" as any, params: { slug } });
        } else {
          router.replace("/(tabs)" as any);
        }
      }}
      hitSlop={12}
      style={{ padding: 8 }}
    >
      <Ionicons name="chevron-back" size={24} color={tokens.color.primary} />
    </Pressable>
  );
}

export default function CountrySlugLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: () => <AppHeaderTitle />,
        headerTitleAlign: "center",
        headerBackTitle: "",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: tokens.color.surface },
        headerLeft: () => <BackButton />,
        headerLeftContainerStyle: { paddingLeft: 8 },
        title: "",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <BackButton fallback="/(tabs)" />,
          title: "",
          headerBackTitle: "",
        }}
      />
      <Stack.Screen
        name="resources"
        options={{
          title: "",
          headerBackTitle: "",
          headerLeft: () => <CountryBackButton />,
        }}
      />
      <Stack.Screen
        name="vendors"
        options={{
          title: "",
          headerBackTitle: "",
          headerLeft: () => <CountryBackButton />,
        }}
      />
      <Stack.Screen
        name="community"
        options={{
          title: "",
          headerBackTitle: "",
          headerLeft: () => <CountryBackButton />,
        }}
      />
      <Stack.Screen
        name="saved"
        options={{
          title: "",
          headerBackTitle: "",
          headerLeft: () => <CountryBackButton />,
        }}
      />
      <Stack.Screen
        name="planner"
        options={{
          title: "",
          headerBackTitle: "",
          headerLeft: () => <CountryBackButton />,
        }}
      />
      <Stack.Screen
        name="pathways/[key]"
        options={{
          title: "",
          headerBackTitle: "",
          headerLeft: () => <CountryBackButton />,
        }}
      />
      <Stack.Screen
        name="pathways/passport-notes"
        options={{
          title: "",
          headerBackTitle: "",
          headerLeft: () => <CountryBackButton />,
        }}
      />
    </Stack>
  );
}
