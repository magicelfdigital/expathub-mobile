import { Ionicons } from "@expo/vector-icons";
import { Tabs, useRouter, useSegments } from "expo-router";
import React from "react";
import { Image, Platform, Pressable, View } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { tokens } from "@/theme/tokens";
import { colors } from "@/constants/colors";

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
        color={user ? tokens.color.primary : tokens.color.textSoft}
      />
    </Pressable>
  );
}

const sharedHeaderOptions = {
  headerShown: true,
  headerTitle: () => <FullLogoNoTag />,
  headerTitleAlign: "center" as const,
  headerShadowVisible: false,
  headerStyle: {
    backgroundColor: colors.cream,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerRight: () => <AccountButton />,
};

export default function TabsLayout() {
  const router = useRouter();
  const segments = useSegments();

  return (
    <Tabs
      sceneContainerStyle={{ backgroundColor: 'transparent' }}
      screenOptions={{
        ...sharedHeaderOptions,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.onDarkSoft,
        tabBarStyle: {
          backgroundColor: colors.glassDark,
          borderTopColor: colors.borderDark,
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
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          headerShown: false,
          title: "Explore",
          tabBarLabel: "Explore",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "compass" : "compass-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="community/index"
        options={{
          title: "Community",
          tabBarLabel: "Community",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "people" : "people-outline"} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="country"
        options={{
          headerShown: false,
          title: "Countries",
          tabBarLabel: "Countries",
          tabBarIcon: ({ color, focused, size }) => (
            <Ionicons name={focused ? "earth" : "earth-outline"} size={size} color={color} />
          ),
        }}
        listeners={{
          tabPress: (e) => {
            const inCountryTab = segments[0] === "(tabs)" && segments[1] === "country";
            const onCountryIndex = inCountryTab && segments.length <= 2;
            if (!onCountryIndex) {
              e.preventDefault();
              router.navigate("/(tabs)/country" as any);
            }
          },
        }}
      />
    </Tabs>
  );
}
