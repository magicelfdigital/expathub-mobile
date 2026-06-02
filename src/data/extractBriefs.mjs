// Shared, RN-graph-free parser for the Decision Brief data file.
//
// Both the scheduled CI checker (scripts/monitoring/freshness-check.mjs) and
// the in-app admin dashboard (server/briefFreshness.ts) need to count briefs
// and read each one's `lastReviewedAt` straight from the static TS source,
// without importing the React Native / Expo module graph. They used to keep
// two independent copies of this regex parser, which silently drifted: the
// admin copy still paired every quoted `id:` with the next `lastReviewedAt:`,
// so a nested quoted `id:` (inside `sourceLinks`, `changeLog`, or `meta`) would
// be mistaken for a new brief and mis-pair review dates. Keeping the parser in
// one place is the only way to guarantee the dashboard and the cron job count
// briefs identically.
//
// The BRIEFS const is an array of object literals; each top-level object is one
// brief. We walk the array with a string/comment-aware scanner that tracks
// bracket depth, and only capture the `id` / `countrySlug` / `pathwayKey` /
// `lastReviewedAt` fields declared *directly* on a brief object (depth 2:
// inside the array's `[` and the brief's `{`).
//
// This is deliberately stricter than pairing every `id: "..."` with the next
// `lastReviewedAt: "..."`: a nested quoted `id:` introduced inside a brief's
// `sourceLinks`, `changeLog`, or `meta` (depth >= 3) would otherwise be treated
// as a new brief and silently mis-pair review dates. Such nested ids are
// ignored. Type definitions above the BRIEFS const are skipped by anchoring on
// the array's opening bracket (past the `: DecisionBrief[]` type annotation).
export function extractBriefs(source) {
  const arrayStart = source.indexOf("const BRIEFS");
  if (arrayStart < 0) return [];
  // Anchor on the assignment so a type annotation like `: DecisionBrief[]`
  // (whose `[]` precedes the `=`) isn't mistaken for the array's opening bracket.
  const eqIdx = source.indexOf("=", arrayStart);
  if (eqIdx < 0) return [];
  const openBracket = source.indexOf("[", eqIdx);
  if (openBracket < 0) return [];

  // Sticky regex so we can probe for a `key: "value"` field at an exact offset
  // without slicing the source on every character. Only double-quoted string
  // values are captured (matching the data file's convention); array/object
  // values like `recommendedFor: [...]` simply don't match.
  const fieldRe = /([A-Za-z_$][\w$]*)\s*:\s*"((?:[^"\\]|\\.)*)"/y;

  const briefs = [];
  let depth = 0;
  let current = null;
  let inString = false;
  let stringChar = "";
  let escaped = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = openBracket; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];

    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i++;
      }
      continue;
    }
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (c === "\\") {
        escaped = true;
      } else if (c === stringChar) {
        inString = false;
      }
      continue;
    }

    if (c === "/" && next === "/") {
      inLineComment = true;
      i++;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = true;
      stringChar = c;
      continue;
    }

    if (c === "{" || c === "[" || c === "(") {
      depth++;
      if (depth === 2 && c === "{") {
        current = {
          id: null,
          countrySlug: null,
          pathwayKey: null,
          lastReviewedAt: null,
        };
      }
      continue;
    }
    if (c === "}" || c === "]" || c === ")") {
      if (depth === 2 && c === "}") {
        if (current && current.id !== null && current.lastReviewedAt !== null) {
          briefs.push(current);
        }
        current = null;
      }
      depth--;
      if (depth === 0) break; // closed the BRIEFS array
      continue;
    }

    // Capture only fields declared directly on a brief object (depth 2).
    // Nested `id:` / `lastReviewedAt:` inside sourceLinks, changeLog, meta,
    // etc. live at depth >= 3 and are deliberately skipped.
    if (depth === 2 && current) {
      fieldRe.lastIndex = i;
      const m = fieldRe.exec(source);
      if (m) {
        const key = m[1];
        const value = m[2];
        if (key === "id" && current.id === null) current.id = value;
        else if (key === "countrySlug" && current.countrySlug === null)
          current.countrySlug = value;
        else if (key === "pathwayKey" && current.pathwayKey === null)
          current.pathwayKey = value;
        else if (key === "lastReviewedAt" && current.lastReviewedAt === null)
          current.lastReviewedAt = value;
        i = fieldRe.lastIndex - 1; // -1 because the for-loop will ++
        continue;
      }
    }
  }
  return briefs;
}
