import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import React from "react";
import { Image, Pressable } from "react-native";
import { tokens } from "@/theme/tokens";

function AppHeaderTitle() {
  return (
    <Image
      source={require("../../../assets/brand/fulllogo_transparent_nobuffer no_tag.png")}
      resizeMode="contain"
      style={{ height: 28, width: 160 }}
    />
  );
}

function BackButton() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => {
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace("/(tabs)/explore" as any);
        }
      }}
      hitSlop={10}
      style={{ padding: 4 }}
    >
      <Ionicons name="chevron-back" size={24} color={tokens.color.primary} />
    </Pressable>
  );
}

const topicScreenOptions = {
  title: "",
  headerLeft: () => <BackButton />,
};

export default function ExploreLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: () => <AppHeaderTitle />,
        headerTitleAlign: "center",
        headerShadowVisible: false,
        headerStyle: { backgroundColor: tokens.color.bg },
        title: "",
      }}
    >
      <Stack.Screen name="index" options={{ title: "" }} />
      <Stack.Screen name="compare" options={topicScreenOptions} />
      <Stack.Screen name="remote-work" options={topicScreenOptions} />
      <Stack.Screen name="sponsorship" options={topicScreenOptions} />
      <Stack.Screen name="flexibility" options={topicScreenOptions} />
      <Stack.Screen name="pr" options={topicScreenOptions} />
      <Stack.Screen name="glossary" options={topicScreenOptions} />
    </Stack>
  );
}
