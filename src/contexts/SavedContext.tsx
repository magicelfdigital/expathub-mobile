import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type SavedState = Record<string, string[]>;

type SavedContextValue = {
  toggleSavedResource: (countrySlug: string, resourceId: string) => void;
  isSaved: (countrySlug: string, resourceId: string) => boolean;
  getSavedResources: (countrySlug: string) => string[];
  removeSavedResource: (countrySlug: string, resourceId: string) => void;
};

const STORAGE_KEY = "expathub_saved";

const SavedContext = createContext<SavedContextValue | undefined>(undefined);

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SavedState>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw && mounted) {
          setState(JSON.parse(raw) as SavedState);
        }
      } catch (e) {
        console.warn("[SavedContext] Failed to load state:", e);
      }
      if (mounted) setIsLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
      console.warn("[SavedContext] Failed to persist state:", e)
    );
  }, [state, isLoaded]);

  const toggleSavedResource = useCallback((countrySlug: string, resourceId: string) => {
    setState((prev) => {
      const list = prev[countrySlug] ?? [];
      const exists = list.includes(resourceId);
      return {
        ...prev,
        [countrySlug]: exists
          ? list.filter((id) => id !== resourceId)
          : [...list, resourceId],
      };
    });
  }, []);

  const isSaved = useCallback((countrySlug: string, resourceId: string): boolean => {
    return (state[countrySlug] ?? []).includes(resourceId);
  }, [state]);

  const getSavedResources = useCallback((countrySlug: string): string[] => {
    return state[countrySlug] ?? [];
  }, [state]);

  const removeSavedResource = useCallback((countrySlug: string, resourceId: string) => {
    setState((prev) => {
      const list = prev[countrySlug] ?? [];
      if (!list.includes(resourceId)) return prev;
      return {
        ...prev,
        [countrySlug]: list.filter((id) => id !== resourceId),
      };
    });
  }, []);

  const value = useMemo<SavedContextValue>(
    () => ({ toggleSavedResource, isSaved, getSavedResources, removeSavedResource }),
    [toggleSavedResource, isSaved, getSavedResources, removeSavedResource]
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  const ctx = useContext(SavedContext);
  if (!ctx) throw new Error("useSaved must be used within SavedProvider");
  return ctx;
}
