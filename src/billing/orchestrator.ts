import type {
  RevenueCatClient,
  BackendClient,
  BackendEntitlements,
  OrchestratorResult,
  PollingConfig,
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
    try {
      await this.rcClient.restorePurchases();
    } catch (err: any) {
      throw new RevenueCatPurchaseError(
        err?.message ?? "Restore failed",
        { cause: err },
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
