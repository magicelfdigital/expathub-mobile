class PostHog {
  constructor(_apiKey: string, _options?: Record<string, unknown>) {}
  identify(_distinctId: string, _traits?: Record<string, unknown>): void {}
  capture(_event: string, _props?: Record<string, unknown>): void {}
  shutdown(): void {}
  getDistinctId(): string {
    return "";
  }
}

export default PostHog;
