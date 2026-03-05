import { Stack } from "expo-router";
import React from "react";
import { Image } from "react-native";
import { colors } from "@/constants/colors";

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
        contentStyle: { backgroundColor: 'transparent' },
        navigationBarColor: 'transparent',
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerShown: true,
          headerTitle: () => <AppHeaderTitle />,
          headerTitleAlign: "center",
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: colors.glassDark,
            borderBottomWidth: 1,
            borderBottomColor: colors.borderDark,
          },
          title: "",
        }}
      />
      <Stack.Screen
        name="[slug]"
        options={{ headerShown: false, title: "" }}
        getId={({ params }) => params?.slug as string}
      />
    </Stack>
  );
}
