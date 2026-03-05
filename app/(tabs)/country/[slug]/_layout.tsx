import { Ionicons } from "@expo/vector-icons";
import { tokens } from "@/theme/tokens";
import { colors } from "@/constants/colors";
import { Stack, useRouter, useLocalSearchParams } from "expo-router";
import React from "react";
import { Image, Pressable, Text, View } from "react-native";

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

function PathfinderBadge() {
  return (
    <View style={{ marginRight: 12 }}>
      <Text
        style={{
          color: tokens.color.gold,
          backgroundColor: tokens.color.goldLight,
          borderWidth: 1,
          borderColor: 'rgba(232,153,26,0.25)',
          borderRadius: 20,
          paddingHorizontal: 10,
          paddingVertical: 4,
          fontSize: 11,
          fontFamily: tokens.font.bodySemiBold,
          overflow: 'hidden',
        }}
      >
        Pathfinder
      </Text>
    </View>
  );
}

const glassHeader = {
  backgroundColor: colors.glassLight,
  borderBottomWidth: 1,
  borderBottomColor: colors.borderDark,
};

const detailScreenOptions = {
  title: "",
  headerBackTitle: "",
  headerLeft: () => <CountryBackButton />,
  headerRight: () => <PathfinderBadge />,
};

export default function CountrySlugLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerTitle: () => <AppHeaderTitle />,
        headerTitleAlign: "center",
        headerBackTitle: "",
        headerShadowVisible: false,
        headerStyle: glassHeader,
        headerLeft: () => <BackButton />,
        headerLeftContainerStyle: { paddingLeft: 8 },
        title: "",
        contentStyle: { backgroundColor: 'transparent' },
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
