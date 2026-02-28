import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
      } catch {}
      if (mounted) setIsLoaded(true);
    })();
    return () => { mounted = false; };
  }, []);

  const persist = useCallback(async (next: SavedState) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  const toggleSavedResource = useCallback((countrySlug: string, resourceId: string) => {
    setState((prev) => {
      const list = prev[countrySlug] ?? [];
      const exists = list.includes(resourceId);
      const next = {
        ...prev,
        [countrySlug]: exists
          ? list.filter((id) => id !== resourceId)
          : [...list, resourceId],
      };
      persist(next);
      return next;
    });
  }, [persist]);

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
      const next = {
        ...prev,
        [countrySlug]: list.filter((id) => id !== resourceId),
      };
      persist(next);
      return next;
    });
  }, [persist]);

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
