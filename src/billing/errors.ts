export class BillingRefreshError extends Error {
  readonly code = "BILLING_REFRESH_ERROR";
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "BillingRefreshError";
  }
}

export class EntitlementPollingTimeoutError extends Error {
  readonly code = "ENTITLEMENT_POLLING_TIMEOUT";
  constructor(
    public readonly elapsedMs: number,
    public readonly pollCount: number,
  ) {
    super(
      `Entitlement polling timed out after ${elapsedMs}ms (${pollCount} polls)`,
    );
    this.name = "EntitlementPollingTimeoutError";
  }
}

export class RevenueCatPurchaseError extends Error {
  readonly code = "REVENUECAT_PURCHASE_ERROR";
  public readonly userCancelled: boolean;
  constructor(message: string, options?: { userCancelled?: boolean; cause?: unknown }) {
    super(message);
    this.name = "RevenueCatPurchaseError";
    this.userCancelled = options?.userCancelled ?? false;
    if (options?.cause) {
      (this as any).cause = options.cause;
    }
  }
}
