import { GENERIC_PLAN_STEP_IDS } from "@shared/planSteps";

type Row = {
  user_id: string;
  target_country: string;
  step_id: string;
  completed: boolean;
  completed_at: Date | null;
  created_at: Date | null;
};

type MigrationRow = { name: string; applied_at: Date };

function makeFakePool(opts: {
  rows: Row[];
  migrations?: MigrationRow[];
  userProgressColumnExists?: boolean;
}) {
  const rows = opts.rows;
  const migrations: MigrationRow[] = opts.migrations ? [...opts.migrations] : [];
  let columnExists = opts.userProgressColumnExists ?? true;
  const callLog: Array<{ text: string; values: any[] }> = [];

  const query = jest.fn(async (text: string, values: any[] = []) => {
    callLog.push({ text, values });
    const trimmed = text.replace(/\s+/g, " ").trim();

    if (trimmed.startsWith("CREATE TABLE IF NOT EXISTS schema_migrations")) {
      return { rows: [] };
    }

    // Fake DO-block: simulates the atomic "add column + record migration"
    // step. The real DO block is server-side PL/pgSQL; here we just
    // emulate the observable side-effects.
    if (trimmed.startsWith("DO $do$")) {
      if (!columnExists) {
        const ts = new Date();
        for (const r of rows) {
          if (r.created_at == null) r.created_at = ts;
        }
        if (!migrations.some((m) => m.name === "user_progress_created_at")) {
          migrations.push({ name: "user_progress_created_at", applied_at: ts });
        }
        columnExists = true;
      }
      return { rows: [] };
    }

    if (
      trimmed.startsWith("SELECT applied_at FROM schema_migrations WHERE name")
    ) {
      const name = values[0] as string;
      const found = migrations.find((m) => m.name === name);
      return { rows: found ? [{ applied_at: found.applied_at }] : [] };
    }

    if (
      trimmed.startsWith(
        "UPDATE user_progress AS up SET created_at = sub.first_completion",
      )
    ) {
      const target = (values[0] as Date).getTime();
      const firstCompletion = new Map<string, Date>();
      for (const r of rows) {
        if (r.completed_at == null) continue;
        const key = `${r.user_id}|${r.target_country}`;
        const cur = firstCompletion.get(key);
        if (!cur || r.completed_at < cur)
          firstCompletion.set(key, r.completed_at);
      }
      for (const r of rows) {
        if (r.created_at?.getTime() !== target) continue;
        const key = `${r.user_id}|${r.target_country}`;
        const fc = firstCompletion.get(key);
        if (fc) r.created_at = fc;
      }
      return { rows: [] };
    }

    if (trimmed.startsWith("UPDATE user_progress SET created_at = NULL")) {
      const target = (values[0] as Date).getTime();
      for (const r of rows) {
        if (r.created_at?.getTime() === target) r.created_at = null;
      }
      return { rows: [] };
    }

    throw new Error(`Unexpected query in test fake: ${trimmed}`);
  });

  return {
    pool: { query } as any,
    query,
    callLog,
    migrations,
  };
}

function seedPlan(opts: {
  rows: Row[];
  userId: string;
  country: string;
  createdAt: Date;
  completions?: Record<string, Date>;
}) {
  const { rows, userId, country, createdAt, completions = {} } = opts;
  for (const stepId of GENERIC_PLAN_STEP_IDS) {
    const completedAt = completions[stepId] ?? null;
    rows.push({
      user_id: userId,
      target_country: country,
      step_id: stepId,
      completed: completedAt != null,
      completed_at: completedAt,
      created_at: createdAt,
    });
  }
}

// Re-import the module under test fresh for each `it` so the in-process
// memoization (`createdAtColumnPromise`, `createdAtBackfillPromise`)
// starts clean and we can observe the first-call behaviour repeatedly.
function freshModule(): typeof import("../plannerAnalytics") {
  let mod!: typeof import("../plannerAnalytics");
  jest.isolateModules(() => {
    mod = require("../plannerAnalytics");
  });
  return mod;
}

describe("backfillUserProgressMigrationCreatedAt", () => {
  const migrationTs = new Date("2026-04-01T12:00:00Z");

  it("rewrites only rows that match the recorded migration timestamp", async () => {
    const { backfillUserProgressMigrationCreatedAt: backfill } = freshModule();

    const rows: Row[] = [];
    seedPlan({
      rows,
      userId: "u1",
      country: "portugal",
      createdAt: migrationTs,
      completions: {
        research_quiz: new Date("2026-01-15T10:00:00Z"),
        shortlist_built: new Date("2026-02-20T10:00:00Z"),
      },
    });
    seedPlan({
      rows,
      userId: "u2",
      country: "spain",
      createdAt: migrationTs,
      completions: {
        visa_pathway: new Date("2026-03-10T08:00:00Z"),
      },
    });
    // A plan with no completions at all — should end up NULL.
    seedPlan({
      rows,
      userId: "u3",
      country: "germany",
      createdAt: migrationTs,
    });

    const { pool } = makeFakePool({
      rows,
      migrations: [
        { name: "user_progress_created_at", applied_at: migrationTs },
      ],
    });
    await backfill(pool);

    const u1 = rows.filter((r) => r.user_id === "u1");
    const u2 = rows.filter((r) => r.user_id === "u2");
    const u3 = rows.filter((r) => r.user_id === "u3");

    expect(new Set(u1.map((r) => r.created_at?.toISOString()))).toEqual(
      new Set(["2026-01-15T10:00:00.000Z"]),
    );
    expect(new Set(u2.map((r) => r.created_at?.toISOString()))).toEqual(
      new Set(["2026-03-10T08:00:00.000Z"]),
    );
    for (const r of u3) {
      expect(r.created_at).toBeNull();
    }
  });

  it("leaves rows alone when the recorded timestamp doesn't match (no false positives on bulk inserts)", async () => {
    const { backfillUserProgressMigrationCreatedAt: backfill } = freshModule();

    // Simulate a future code path that bulk-inserts way more than one
    // seed batch in a single transaction (e.g. an admin import) all
    // sharing an identical created_at. The old heuristic would have
    // wrongly null-ed these out; the new code keys off the recorded
    // migration timestamp instead, so they survive.
    const bulkInsertTs = new Date("2026-04-15T09:00:00Z");
    const rows: Row[] = [];
    for (let i = 0; i < 5; i++) {
      seedPlan({
        rows,
        userId: `bulk_u${i}`,
        country: "portugal",
        createdAt: bulkInsertTs,
      });
    }

    const before = rows.map((r) => r.created_at?.toISOString());
    const { pool } = makeFakePool({
      rows,
      migrations: [
        { name: "user_progress_created_at", applied_at: migrationTs },
      ],
    });
    await backfill(pool);
    const after = rows.map((r) => r.created_at?.toISOString());

    expect(after).toEqual(before);
  });

  it("is a no-op when no migration row was recorded", async () => {
    const { backfillUserProgressMigrationCreatedAt: backfill } = freshModule();

    const rows: Row[] = [];
    seedPlan({
      rows,
      userId: "u1",
      country: "portugal",
      createdAt: migrationTs,
    });

    const { pool, query } = makeFakePool({ rows, migrations: [] });
    await backfill(pool);

    // Lookup must happen, but no UPDATEs should follow.
    const updateCalls = query.mock.calls.filter(([t]) =>
      String(t).includes("UPDATE user_progress"),
    );
    expect(updateCalls.length).toBe(0);
    expect(rows[0].created_at).toEqual(migrationTs);
  });

  it("is process-cached: subsequent calls do not requery", async () => {
    const { backfillUserProgressMigrationCreatedAt: backfill } = freshModule();

    const { pool, query } = makeFakePool({ rows: [], migrations: [] });
    await backfill(pool);
    const firstCallCount = query.mock.calls.length;
    await backfill(pool);
    expect(query.mock.calls.length).toBe(firstCallCount);
  });

  it("clears the memo on failure so the next call retries the backfill", async () => {
    const { backfillUserProgressMigrationCreatedAt: backfill } = freshModule();

    const failingPool = {
      query: jest
        .fn()
        .mockRejectedValueOnce(new Error("transient db blip"))
        .mockResolvedValue({ rows: [] }),
    } as any;

    await expect(backfill(failingPool)).rejects.toThrow("transient db blip");
    // Second call must NOT short-circuit on the failed memo.
    await expect(backfill(failingPool)).resolves.toBeUndefined();
    expect(failingPool.query.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("ensureUserProgressCreatedAt records the migration timestamp atomically and the backfill keys off it", async () => {
    const { ensureUserProgressCreatedAt: ensure } = freshModule();

    // Simulate a fresh DB: no created_at column yet, no schema_migrations
    // entry, and existing user_progress rows with NULL created_at that
    // the DO block will stamp.
    const rows: Row[] = [];
    seedPlan({
      rows,
      userId: "u1",
      country: "portugal",
      createdAt: null as any,
      completions: { research_quiz: new Date("2026-02-01T00:00:00Z") },
    });
    seedPlan({
      rows,
      userId: "u2",
      country: "spain",
      createdAt: null as any,
    });

    const { pool, query, migrations } = makeFakePool({
      rows,
      migrations: [],
      userProgressColumnExists: false,
    });
    await ensure(pool);

    const normalize = (t: unknown) =>
      String(t).replace(/\s+/g, " ").trim();
    const createSchemaCalls = query.mock.calls.filter(([t]) =>
      normalize(t).includes("CREATE TABLE IF NOT EXISTS schema_migrations"),
    );
    const doBlockCalls = query.mock.calls.filter(([t]) =>
      normalize(t).includes("DO $do$"),
    );
    const lookupCalls = query.mock.calls.filter(([t]) =>
      normalize(t).includes("SELECT applied_at FROM schema_migrations"),
    );
    expect(createSchemaCalls.length).toBe(1);
    expect(doBlockCalls.length).toBe(1);
    expect(lookupCalls.length).toBe(1);

    // The DO block fake recorded a single migration row …
    expect(migrations).toHaveLength(1);
    expect(migrations[0].name).toBe("user_progress_created_at");

    // … and the backfill used that exact timestamp to fix up rows:
    // u1 had a completion → promoted to 2026-02-01.
    // u2 had none → nulled out.
    const u1Row = rows.find((r) => r.user_id === "u1")!;
    const u2Row = rows.find((r) => r.user_id === "u2")!;
    expect(u1Row.created_at?.toISOString()).toBe("2026-02-01T00:00:00.000Z");
    expect(u2Row.created_at).toBeNull();

    const callsAfterFirst = query.mock.calls.length;
    await ensure(pool);
    expect(query.mock.calls.length).toBe(callsAfterFirst);
  });
});
