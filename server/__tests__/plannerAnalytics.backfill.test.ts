import { GENERIC_PLAN_STEP_IDS } from "@shared/planSteps";

type Row = {
  user_id: string;
  target_country: string;
  step_id: string;
  completed: boolean;
  completed_at: Date | null;
  created_at: Date | null;
};

function makeFakePool(rows: Row[]) {
  const callLog: Array<{ text: string; values: any[] }> = [];

  const query = jest.fn(async (text: string, values: any[] = []) => {
    callLog.push({ text, values });
    const trimmed = text.replace(/\s+/g, " ").trim();

    if (trimmed.startsWith("ALTER TABLE user_progress")) {
      return { rows: [] };
    }

    if (
      trimmed.startsWith("SELECT created_at FROM user_progress") &&
      trimmed.includes("HAVING COUNT(*) >")
    ) {
      const threshold = values[0] as number;
      const counts = new Map<number, number>();
      for (const r of rows) {
        if (r.created_at == null) continue;
        const k = r.created_at.getTime();
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return {
        rows: Array.from(counts.entries())
          .filter(([, n]) => n > threshold)
          .map(([k]) => ({ created_at: new Date(k) })),
      };
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
// memoization (`createdAtColumnEnsured`, `createdAtBackfillRun`) starts
// clean and we can observe the first-call behaviour repeatedly.
function freshModule(): typeof import("../plannerAnalytics") {
  let mod!: typeof import("../plannerAnalytics");
  jest.isolateModules(() => {
    mod = require("../plannerAnalytics");
  });
  return mod;
}

describe("backfillUserProgressMigrationCreatedAt", () => {
  it("rewrites migration-stamped rows to the earliest completed_at for the plan", async () => {
    const { backfillUserProgressMigrationCreatedAt: backfill } = freshModule();

    const migrationTs = new Date("2026-04-01T12:00:00Z");
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

    const { pool } = makeFakePool(rows);
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

  it("leaves a single recent seed batch alone (10 rows is not above the threshold)", async () => {
    const { backfillUserProgressMigrationCreatedAt: backfill } = freshModule();

    const recentSeed = new Date("2026-04-15T09:00:00Z");
    const rows: Row[] = [];
    seedPlan({
      rows,
      userId: "u_new",
      country: "portugal",
      createdAt: recentSeed,
    });

    const before = rows.map((r) => r.created_at?.toISOString());
    const { pool } = makeFakePool(rows);
    await backfill(pool);
    const after = rows.map((r) => r.created_at?.toISOString());

    expect(after).toEqual(before);
  });

  it("is process-cached: subsequent calls do not requery", async () => {
    const { backfillUserProgressMigrationCreatedAt: backfill } = freshModule();

    const { pool, query } = makeFakePool([]);
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

  it("ensureUserProgressCreatedAt runs the ALTER TABLE then the backfill exactly once", async () => {
    const { ensureUserProgressCreatedAt: ensure } = freshModule();

    const migrationTs = new Date("2026-04-01T12:00:00Z");
    const rows: Row[] = [];
    seedPlan({
      rows,
      userId: "u1",
      country: "portugal",
      createdAt: migrationTs,
      completions: { research_quiz: new Date("2026-02-01T00:00:00Z") },
    });
    seedPlan({
      rows,
      userId: "u2",
      country: "spain",
      createdAt: migrationTs,
    });

    const { pool, query } = makeFakePool(rows);
    await ensure(pool);

    const alterCalls = query.mock.calls.filter(([t]) =>
      t.includes("ALTER TABLE user_progress"),
    );
    const candidateCalls = query.mock.calls.filter(([t]) =>
      t.includes("HAVING COUNT(*) >"),
    );
    expect(alterCalls.length).toBe(1);
    expect(candidateCalls.length).toBe(1);

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
