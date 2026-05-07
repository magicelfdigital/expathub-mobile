import * as React from "react";

export function useSafeAreaInsets() {
  return { top: 47, bottom: 34, left: 0, right: 0 };
}

export function SafeAreaView({ children }: { children?: React.ReactNode }) {
  return React.createElement("SafeAreaView", null, children);
}

export function SafeAreaProvider({ children }: { children?: React.ReactNode }) {
  return React.createElement("SafeAreaProvider", null, children);
}
