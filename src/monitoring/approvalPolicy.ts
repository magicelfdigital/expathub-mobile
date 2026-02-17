import type { Severity } from "@/src/data/severity";

export function requiresApproval(severity: Severity): boolean {
  return severity === "P0" || severity === "P1";
}

export function shouldAutoApply(_severity: Severity): boolean {
  return false;
}
