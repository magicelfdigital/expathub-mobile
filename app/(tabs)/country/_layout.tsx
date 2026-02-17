import { Stack } from "expo-router";
import React from "react";
import { Image } from "react-native";
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

export default function CountryLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerTitle: () => <AppHeaderTitle />,
          headerTitleAlign: "center",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: tokens.color.bg },
          title: "",
        }}
      />
      <Stack.Screen name="[slug]" options={{ headerShown: false, title: "" }} />
    </Stack>
  );
}
