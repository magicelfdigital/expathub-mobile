import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

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
  const pendingClear = useRef(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted) {
          const parsed = JSON.parse(raw) as ContinueState;
          setState(parsed);
        }
      } catch (e) {
        console.warn("[ContinueContext] Failed to load state:", e);
      }
      if (mounted) setIsLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (pendingClear.current) {
      pendingClear.current = false;
      AsyncStorage.removeItem(STORAGE_KEY).catch((e) =>
        console.warn("[ContinueContext] Failed to clear state:", e)
      );
      return;
    }
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
      console.warn("[ContinueContext] Failed to persist state:", e)
    );
  }, [state, isLoaded]);

  const recordView = useCallback((countrySlug: string, section?: ContinueSection, resourceId?: string | null) => {
    setState({
      lastViewedCountrySlug: countrySlug,
      lastViewedSection: section ?? null,
      lastViewedResourceId: resourceId ?? null,
    });
  }, []);

  const clearContinue = useCallback(() => {
    pendingClear.current = true;
    setState(EMPTY);
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
