import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@/theme/tokens";
import { Stack, useRouter } from "expo-router";
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
        if (router.canGoBack()) {
          router.back();
        } else if (fallback) {
          router.replace(fallback as any);
        } else {
          router.replace("/(tabs)/country" as any);
        }
      }}
      hitSlop={10}
      style={{ padding: 4 }}
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
        headerStyle: { backgroundColor: tokens.color.bg },
        headerLeft: () => <BackButton />,
        title: "",
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerLeft: () => <BackButton />,
          title: "",
          headerBackTitle: "",
        }}
      />
      <Stack.Screen
        name="resources"
        options={{
          title: "",
          headerBackTitle: "",
        }}
      />
      <Stack.Screen
        name="vendors"
        options={{
          title: "",
          headerBackTitle: "",
        }}
      />
      <Stack.Screen
        name="community"
        options={{
          title: "",
          headerBackTitle: "",
        }}
      />
      <Stack.Screen
        name="saved"
        options={{
          title: "",
          headerBackTitle: "",
        }}
      />
      <Stack.Screen
        name="pathways/[key]"
        options={{
          title: "",
          headerBackTitle: "",
        }}
      />
      <Stack.Screen
        name="pathways/passport-notes"
        options={{
          title: "",
          headerBackTitle: "",
        }}
      />
    </Stack>
  );
}
