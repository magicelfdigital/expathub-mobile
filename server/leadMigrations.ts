import pg from "pg";

// Deterministic, startup-time migration that finishes the readiness-level
// column rename (task #115) by dropping the legacy `tier` column from both
// lead tables (task #131). The column was kept as a safety net during the
// rollout so an older server version could still read existing rows; now that
// the new code has shipped and there are no in-flight readers, it is dropped.
//
// This runs once at server boot (see server/index.ts), NOT inside request
// handlers, so the schema change is guaranteed and DDL never executes on a hot
// request path. It is idempotent (`DROP COLUMN IF EXISTS`), guarded by a
// transaction-scoped advisory lock so concurrent app instances don't race, and
// recorded in `schema_migrations` for observability — mirroring the existing
// migration pattern in server/plannerAnalytics.ts.
export const LEAD_TIER_DROP_MIGRATION = "drop_lead_tier_columns";

let leadTierDropPromise: Promise<void> | null = null;

export function resetLeadTierDropMigrationCache(): void {
  leadTierDropPromise = null;
}

export function runLeadTierDropMigration(pool: pg.Pool): Promise<void> {
  if (leadTierDropPromise) return leadTierDropPromise;
  leadTierDropPromise = (async () => {
    try {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           name TEXT PRIMARY KEY,
           applied_at TIMESTAMP NOT NULL
         )`,
      );
      await pool.query(
        `DO $do$
         BEGIN
           -- Serialize across concurrent app processes so the drop and the
           -- bookkeeping insert run as one critical section. The
           -- transaction-scoped advisory lock releases automatically on COMMIT.
           PERFORM pg_advisory_xact_lock(
             hashtext('${LEAD_TIER_DROP_MIGRATION}')
           );
           ALTER TABLE readiness_leads DROP COLUMN IF EXISTS tier;
           ALTER TABLE quiz_leads DROP COLUMN IF EXISTS tier;
           INSERT INTO schema_migrations (name, applied_at)
                VALUES ('${LEAD_TIER_DROP_MIGRATION}', now())
           ON CONFLICT (name) DO NOTHING;
         END $do$;`,
      );
    } catch (err) {
      // Drop the memo so a later caller can retry instead of inheriting the
      // failure for the lifetime of the process.
      leadTierDropPromise = null;
      throw err;
    }
  })();
  return leadTierDropPromise;
}
