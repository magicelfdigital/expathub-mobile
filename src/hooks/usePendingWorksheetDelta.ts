import { useEffect, useState } from "react";

import { useOnboarding } from "@/contexts/OnboardingContext";
import type { WorksheetDelta } from "@/src/onboarding/worksheetDelta";

export function usePendingWorksheetDelta() {
  const { pendingWorksheetDelta, clearPendingWorksheetDelta } = useOnboarding();
  const [activeDelta, setActiveDelta] = useState<WorksheetDelta | null>(null);

  useEffect(() => {
    if (pendingWorksheetDelta) {
      setActiveDelta(pendingWorksheetDelta);
      clearPendingWorksheetDelta();
    }
  }, [pendingWorksheetDelta, clearPendingWorksheetDelta]);

  return {
    activeDelta,
    dismiss: () => setActiveDelta(null),
  };
}
