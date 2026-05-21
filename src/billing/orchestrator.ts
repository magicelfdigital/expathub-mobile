import type {
  RevenueCatClient,
  BackendClient,
  BackendEntitlements,
  OrchestratorResult,
  PollingConfig,
  BillingAnalyticsHook,
} from "./types";
import { DEFAULT_POLLING_CONFIG } from "./types";
import { poll } from "./polling";
import {
  BillingRefreshError,
  EntitlementPollingTimeoutError,
  RevenueCatPurchaseError,
} from "./errors";
import { hasEntitlement } from "./entitlementGate";

export class BillingOrchestrator {
  constructor(
    private rcClient: RevenueCatClient,
    private backendClient: BackendClient,
    private pollingConfig: PollingConfig = DEFAULT_POLLING_CONFIG,
    private analytics?: BillingAnalyticsHook,
  ) {}

  async purchase(
    productId: string,
    userId: string,
  ): Promise<OrchestratorResult> {
    let rcResult;
    try {
      rcResult = await this.rcClient.purchasePackage(productId);
    } catch (err: any) {
      throw new RevenueCatPurchaseError(err?.message ?? "Purchase failed", {
        userCancelled: err?.userCancelled ?? false,
        cause: err,
      });
    }

    try {
      await this.backendClient.refreshMobileBilling({
        userId,
        transactionId: rcResult.productIdentifier,
        source: "revenuecat",
        action: "purchase",
      });
    } catch (err: any) {
      throw new BillingRefreshError(
        err?.message ?? "Backend refresh failed after purchase",
        err,
      );
    }

    return this.pollEntitlements(userId);
  }

  async restore(userId: string): Promise<OrchestratorResult> {
    const preCheck = await this.preCheckEntitlements(userId);
    if (preCheck && hasEntitlement(preCheck)) {
      return { entitlements: preCheck, status: "confirmed" };
    }

    // Tri-state: "restored" (RC reported at least one active sub/entitlement),
    // "none" (RC succeeded but reported nothing), or "unknown" (RC threw —
    // we cannot tell, so we must fall back to the polling path to avoid
    // false-negatives during transient SDK/network failures).
    let rcOutcome: "restored" | "none" | "unknown" = "unknown";
    try {
      const rcResult = await this.rcClient.restorePurchases();
      const activeCount = rcResult?.activeSubscriptions?.length ?? 0;
      const activeEntCount = rcResult?.entitlements?.active
        ? Object.keys(rcResult.entitlements.active).length
        : 0;
      rcOutcome = activeCount > 0 || activeEntCount > 0 ? "restored" : "none";
    } catch (err: any) {
      console.warn(
        "[BillingOrchestrator] RC restorePurchases failed; falling back to polling",
        err,
      );
    }

    try {
      await this.backendClient.refreshMobileBilling({
        userId,
        source: "revenuecat",
        action: "restore",
      });
    } catch (err: any) {
      throw new BillingRefreshError(
        err?.message ?? "Backend refresh failed after restore",
        err,
      );
    }

    // If RevenueCat explicitly reported nothing to restore, the user
    // simply has no purchases on this Apple ID. Do a single entitlement
    // check instead of polling for 60s — otherwise the UI hangs the full
    // timeout before showing "No active purchases found". We do NOT skip
    // polling when rcOutcome === "unknown" (RC threw), because backend
    // entitlement propagation may still be in flight.
    if (rcOutcome === "none") {
      const entitlements = await this.backendClient.getEntitlements(userId);
      return {
        entitlements,
        status: hasEntitlement(entitlements) ? "confirmed" : "pending",
      };
    }

    return this.pollEntitlements(userId);
  }

  async syncOnLogin(userId: string): Promise<OrchestratorResult> {
    try {
      await this.rcClient.logIn(userId);
    } catch (err: any) {
      throw new RevenueCatPurchaseError(
        err?.message ?? "RC logIn failed",
        { cause: err },
      );
    }

    try {
      await this.backendClient.refreshMobileBilling({
        userId,
        source: "revenuecat",
      });
    } catch (err: any) {
      throw new BillingRefreshError(
        err?.message ?? "Backend refresh failed after login sync",
        err,
      );
    }

    const entitlements = await this.backendClient.getEntitlements(userId);
    return {
      entitlements,
      status: hasEntitlement(entitlements) ? "confirmed" : "pending",
    };
  }

  private async preCheckEntitlements(
    userId: string,
  ): Promise<BackendEntitlements | null> {
    try {
      return await this.backendClient.getEntitlements(userId);
    } catch (err: unknown) {
      console.warn(
        "[BillingOrchestrator] restore pre-check attempt 1 failed, retrying",
        err,
      );
    }
    try {
      return await this.backendClient.getEntitlements(userId);
    } catch (err: unknown) {
      console.warn(
        "[BillingOrchestrator] restore pre-check attempt 2 failed, falling through to RC restore",
        err,
      );
      try {
        this.analytics?.("billing_pre_check_failed", {
          error: err instanceof Error ? err.message : String(err),
          attempts: 2,
        });
      } catch {}
      return null;
    }
  }

  private async pollEntitlements(userId: string): Promise<OrchestratorResult> {
    const { result: entitlements, timedOut, pollCount, elapsedMs } = await poll({
      fn: () => this.backendClient.getEntitlements(userId),
      shouldStop: (ent) => hasEntitlement(ent),
      intervalMs: this.pollingConfig.intervalMs,
      timeoutMs: this.pollingConfig.timeoutMs,
    });

    if (timedOut) {
      throw new EntitlementPollingTimeoutError(elapsedMs, pollCount);
    }

    return {
      entitlements,
      status: "confirmed",
    };
  }
}
