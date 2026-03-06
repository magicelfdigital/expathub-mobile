import { Stack } from "expo-router";
import React from "react";

export default function HomeStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "fade",
        animationDuration: 200,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="countries" />
      <Stack.Screen
        name="country/[slug]"
        getId={({ params }) => params?.slug ?? "default"}
        options={{
          animation: "slide_from_bottom",
          animationDuration: 250,
        }}
      />
    </Stack>
  );
}
