// Spec mapping: guideMeLabel → intended destination route. Routes that do not
// yet exist on disk fall through to the coming-soon screen via resolveGuideMeRoute.
export const GUIDE_ME_ROUTE_MAP: Record<string, string> = {
  "Help me calculate my real moving budget": "/tools/budget-calculator",
  "Show me cost of living for my top region": "/content/cost-of-living",
  "Help me build a savings runway plan": "/content/cost-of-living",
  "Show me income requirements for my target visa": "/content/visa-guides",
  "Check if my income qualifies": "/content/visa-guides",
  "Help me map an income transition plan": "/content/visa-guides",
  "Match me to the right visa": "/content/visa-guides",
  "Help me figure out which visa type I need": "/content/visa-guides",
  "Start my visa research": "/content/visa-guides",
  "What professional help do I need and what does it cost": "/content/bureaucracy-guides",
  "Show me what the paperwork process actually looks like": "/content/bureaucracy-guides",
  "Show me lower-bureaucracy destinations": "/content/bureaucracy-guides",
  "Help us research the practical open questions": "/content/destination-guides",
  "Help me think through what my household needs from a destination": "/content/destination-guides",
  "Help me understand what's driving the hesitation": "/content/destination-guides",
  "Show me what daily life actually looks like in my target region": "/content/destination-guides",
  "Show me real expat accounts from my target region": "/content/destination-guides",
  "Help me find destinations that fit my lifestyle requirements": "/content/destination-guides",
  "Walk me through the exit strategy checklist": "/tools/move-timeline",
  "Help me think through a realistic fallback plan": "/tools/move-timeline",
  "Add this to my move timeline": "/tools/move-timeline",
  "Help me build a backwards timeline from my target date": "/tools/move-timeline",
  "Help me take my first concrete step": "/tools/move-timeline",
  "Help me figure out what's actually in the way": "/tools/move-timeline",
};

// Routes from GUIDE_ME_ROUTE_MAP that have actually been built. As the
// destination screens ship, add them here so users land on the real screen
// instead of the coming-soon fallback.
const IMPLEMENTED_GUIDE_ROUTES = new Set<string>([
  // (none yet — all guide destinations route to coming-soon for now)
]);

export function resolveGuideMeRoute(label: string): string {
  const mapped = GUIDE_ME_ROUTE_MAP[label];
  if (mapped && IMPLEMENTED_GUIDE_ROUTES.has(mapped)) {
    return mapped;
  }
  return `/content/coming-soon?label=${encodeURIComponent(label)}`;
}
