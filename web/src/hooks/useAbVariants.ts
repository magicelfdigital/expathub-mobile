import { useEffect, useState } from "react";

export type PaidIntroVariant = "free_trial" | "paid_intro";
export type AnnualVariant = "annual_89" | "annual_99";

export type AbVariants = {
  sessionId: string;
  paidIntro: { variant: PaidIntroVariant; enabled: boolean };
  annual: { variant: AnnualVariant; enabled: boolean; priceUsd: number };
};

const DEFAULT_VARIANTS: AbVariants = {
  sessionId: "",
  paidIntro: { variant: "free_trial", enabled: false },
  annual: { variant: "annual_89", enabled: false, priceUsd: 89 },
};

type ApiResponse = {
  sessionId?: string;
  tests?: {
    paid_intro?: { enabled?: boolean; variant?: PaidIntroVariant };
    annual_price?: { enabled?: boolean; variant?: AnnualVariant; priceUsd?: number };
  };
};

/**
 * Reads the visitor's A/B test variants from the server. Bucketing happens on
 * the server so the same visitor sees the same copy across page reloads. The
 * server sets a `eh_sid` cookie that ties the visitor to their variants and
 * to the eventual conversion record.
 */
export function useAbVariants(): {
  variants: AbVariants;
  isLoading: boolean;
} {
  const [variants, setVariants] = useState<AbVariants>(DEFAULT_VARIANTS);
  const [isLoading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ab/me", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<ApiResponse>) : null))
      .then((data) => {
        if (cancelled || !data) {
          if (!cancelled) setLoading(false);
          return;
        }
        const next: AbVariants = {
          sessionId: data.sessionId ?? "",
          paidIntro: {
            variant: data.tests?.paid_intro?.variant ?? "free_trial",
            enabled: !!data.tests?.paid_intro?.enabled,
          },
          annual: {
            variant: data.tests?.annual_price?.variant ?? "annual_89",
            enabled: !!data.tests?.annual_price?.enabled,
            priceUsd: data.tests?.annual_price?.priceUsd ?? 89,
          },
        };
        setVariants(next);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { variants, isLoading };
}
