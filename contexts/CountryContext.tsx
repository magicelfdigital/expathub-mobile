import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type CountryContextValue = {
  selectedCountrySlug: string | null;
  setSelectedCountrySlug: (slug: string | null) => void;
  isLoaded: boolean;
};

const STORAGE_KEY = "selectedCountrySlug";

const CountryContext = createContext<CountryContextValue | undefined>(undefined);

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [selectedCountrySlug, setSelectedCountrySlugState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (isMounted) setSelectedCountrySlugState(stored ? stored : null);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;

    (async () => {
      try {
        if (selectedCountrySlug) {
          await AsyncStorage.setItem(STORAGE_KEY, selectedCountrySlug);
        } else {
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // ignore storage errors in v1
      }
    })();
  }, [selectedCountrySlug, isLoaded]);

  const setSelectedCountrySlug = useCallback((slug: string | null) => {
    setSelectedCountrySlugState(slug);
  }, []);

  const value = useMemo<CountryContextValue>(
    () => ({
      selectedCountrySlug,
      setSelectedCountrySlug,
      isLoaded,
    }),
    [selectedCountrySlug, setSelectedCountrySlug, isLoaded]
  );

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry() {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error("useCountry must be used within CountryProvider");
  return ctx;
}
