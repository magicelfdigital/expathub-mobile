import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type ContinueSection = "resources" | "vendors" | "community" | null;

type ContinueState = {
  lastViewedCountrySlug: string | null;
  lastViewedSection: ContinueSection;
  lastViewedResourceId: string | null;
};

type ContinueContextValue = ContinueState & {
  isLoaded: boolean;
  recordView: (countrySlug: string, section?: ContinueSection, resourceId?: string | null) => void;
  clearContinue: () => void;
};

const STORAGE_KEY = "expathub_continue";

const EMPTY: ContinueState = {
  lastViewedCountrySlug: null,
  lastViewedSection: null,
  lastViewedResourceId: null,
};

const ContinueContext = createContext<ContinueContextValue | undefined>(undefined);

export function ContinueProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ContinueState>(EMPTY);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw) as ContinueState;
          setState(parsed);
        }
      } catch {}
      if (mounted) setIsLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  const persist = useCallback(async (next: ContinueState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const recordView = useCallback((countrySlug: string, section?: ContinueSection, resourceId?: string | null) => {
    const next: ContinueState = {
      lastViewedCountrySlug: countrySlug,
      lastViewedSection: section ?? null,
      lastViewedResourceId: resourceId ?? null,
    };
    setState(next);
    persist(next);
  }, [persist]);

  const clearContinue = useCallback(() => {
    setState(EMPTY);
    (async () => {
      try { await AsyncStorage.removeItem(STORAGE_KEY); } catch {}
    })();
  }, []);

  const value = useMemo<ContinueContextValue>(
    () => ({
      ...state,
      isLoaded,
      recordView,
      clearContinue,
    }),
    [state, isLoaded, recordView, clearContinue]
  );

  return <ContinueContext.Provider value={value}>{children}</ContinueContext.Provider>;
}

export function useContinue() {
  const ctx = useContext(ContinueContext);
  if (!ctx) throw new Error("useContinue must be used within ContinueProvider");
  return ctx;
}
