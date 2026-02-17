import React from "react";
import { useLocalSearchParams } from "expo-router";

import { useCountry } from "@/contexts/CountryContext";
import { Screen } from "@/components/Screen";
import { ProPaywall } from "@/src/components/ProPaywall";

export default function SubscribeScreen() {
  const { country } = useLocalSearchParams<{ country?: string }>();
  const { selectedCountrySlug } = useCountry();

  const resolvedCountry = country || selectedCountrySlug || undefined;

  return (
    <Screen>
      <ProPaywall showClose countrySlug={resolvedCountry} entryPoint={resolvedCountry ? "country" : "general"} />
    </Screen>
  );
}
