import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { subscribeLogout } from "@/src/lib/logoutBus";

type CountryContextValue = {
  selectedCountrySlug: string | null;
  setSelectedCountrySlug: (slug: string | null) => void;
  isLoaded: boolean;
};

const STORAGE_KEY = "selectedCountrySlug";

let _immediateSlug: string | null = null;

export function getImmediateSlug(): string | null {
  return _immediateSlug;
}

const CountryContext = createContext<CountryContextValue | undefined>(undefined);

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [selectedCountrySlug, setSelectedCountrySlugState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (isMounted) {
          _immediateSlug = stored ?? null;
          setSelectedCountrySlugState(stored ? stored : null);
        }
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
      }
    })();
  }, [selectedCountrySlug, isLoaded]);

  const setSelectedCountrySlug = useCallback((slug: string | null) => {
    _immediateSlug = slug;
    setSelectedCountrySlugState(slug);
  }, []);

  // Reset in-memory country selection when the user signs out.
  useEffect(() => {
    return subscribeLogout(() => {
      _immediateSlug = null;
      setSelectedCountrySlugState(null);
    });
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
