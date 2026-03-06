import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter } from "expo-router";
import React from "react";
import { Image, Platform, Pressable } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { tokens } from "@/theme/tokens";

function FullLogoWithTag() {
  return (
    <Image
      source={require("../../assets/brand/fulllogo_transparent_nobuffer.png")}
      resizeMode="contain"
      style={{ height: 56, width: 240 }}
    />
  );
}

function FullLogoNoTag() {
  return (
    <Image
      source={require("../../assets/brand/fulllogo_transparent_nobuffer no_tag.png")}
      resizeMode="contain"
      style={{ height: 28, width: 160 }}
    />
  );
}

function AccountButton() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <Pressable
      onPress={() => router.push(user ? "/account" : ("/auth?mode=register" as any))}
      hitSlop={12}
      style={{ marginRight: 16 }}
    >
      <Ionicons
        name={user ? "person-circle" : "person-circle-outline"}
        size={28}
        color={user ? tokens.color.primary : tokens.color.subtext}
      />
    </Pressable>
  );
}

const sharedHeaderOptions = {
  headerShown: true,
  headerTitle: () => <FullLogoNoTag />,
  headerTitleAlign: "center" as const,
  headerShadowVisible: false,
  headerStyle: { backgroundColor: tokens.color.bg, borderBottomWidth: 1, borderBottomColor: tokens.color.border },
  headerRight: () => <AccountButton />,
};

export default function TabsLayout() {
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        ...sharedHeaderOptions,
        tabBarActiveTintColor: tokens.color.teal,
        tabBarInactiveTintColor: "rgba(28,43,94,0.4)",
        tabBarStyle: {
          backgroundColor: tokens.color.bg,
          borderTopColor: tokens.color.border,
          borderTopWidth: 1,
          height: Platform.OS === "web" ? 84 : 88,
          paddingBottom: Platform.OS === "web" ? 34 : undefined,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600" as const,
          fontFamily: tokens.font.bodySemiBold,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarLabel: "Home",
          headerShown: false,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          headerShown: false,
          title: "Explore",
          tabBarLabel: "Explore",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community/index"
        options={{
          title: "Community",
          tabBarLabel: "Community",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="country"
        options={{
          headerShown: false,
          href: null,
          unmountOnBlur: true,
        }}
      />
    </Tabs>
  );
}
