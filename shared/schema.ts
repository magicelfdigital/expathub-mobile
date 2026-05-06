import { sql } from "drizzle-orm";
import { boolean, pgTable, serial, text, timestamp, uniqueIndex, varchar, integer, jsonb, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const waitlist = pgTable("waitlist", {
  id: serial("id").primaryKey(),
  countrySlug: varchar("country_slug", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWaitlistSchema = z.object({
  countrySlug: z.string().min(1),
  email: z.string().email(),
  note: z.string().optional(),
});

export type WaitlistEntry = typeof waitlist.$inferSelect;
export type InsertWaitlistEntry = z.infer<typeof insertWaitlistSchema>;

export const readinessLeads = pgTable("readiness_leads", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  score: integer("score"),
  tier: varchar("tier", { length: 50 }),
  risks: jsonb("risks"),
  answers: jsonb("answers"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const countryInterest = pgTable("country_interest", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  countrySlug: varchar("country_slug", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const quizLeads = pgTable("quiz_leads", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  tier: varchar("tier", { length: 50 }).notNull(),
  topRegion: varchar("top_region", { length: 100 }),
  regionPreference: varchar("region_preference", { length: 100 }),
  score: integer("score"),
  risks: jsonb("risks"),
  source: varchar("source", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bookmarks = pgTable("bookmarks", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  countrySlug: varchar("country_slug", { length: 100 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const moveNotes = pgTable("move_notes", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  countrySlug: varchar("country_slug", { length: 100 }).notNull(),
  content: text("content").default(""),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ── A/B test assignments ────────────────────────────────────────────────
//
// One row per (sessionId, testName). Variant is the chosen bucket. We keep a
// single source of truth here so /api/admin/ab-results can join against it
// and so subsequent visits in the same session always get the same variant.
export const abTestAssignments = pgTable(
  "ab_test_assignments",
  {
    id: serial("id").primaryKey(),
    sessionId: varchar("session_id", { length: 64 }).notNull(),
    userId: varchar("user_id", { length: 255 }),
    testName: varchar("test_name", { length: 100 }).notNull(),
    variant: varchar("variant", { length: 50 }).notNull(),
    assignedAt: timestamp("assigned_at").defaultNow(),
  },
  (table) => ({
    sessionTestUnique: uniqueIndex("ab_test_assignments_session_test_idx").on(
      table.sessionId,
      table.testName,
    ),
  }),
);
export type AbTestAssignment = typeof abTestAssignments.$inferSelect;

// ── Conversions per A/B variant ─────────────────────────────────────────
//
// Captures whether a visitor with a given variant assignment converted to a
// paid trial / subscription, plus revenue at day 0 and day 60. Day 60
// revenue is back-filled by an aggregation against Stripe data.
export const conversions = pgTable("conversions", {
  id: serial("id").primaryKey(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  userId: varchar("user_id", { length: 255 }),
  testName: varchar("test_name", { length: 100 }).notNull(),
  variant: varchar("variant", { length: 50 }).notNull(),
  plan: varchar("plan", { length: 50 }),
  converted: boolean("converted").notNull().default(false),
  // Numeric so SUM()/AVG() in /api/admin/ab-results return real numbers
  // and so the runtime CREATE TABLE in server/routes.ts (NUMERIC(10,2))
  // matches the Drizzle schema if the migration is ever generated/applied.
  revenueDay0: numeric("revenue_day_0", { precision: 10, scale: 2 }).default("0"),
  revenueDay60: numeric("revenue_day_60", { precision: 10, scale: 2 }).default("0"),
  stripeSubscriptionId: varchar("stripe_subscription_id", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
});
export type Conversion = typeof conversions.$inferSelect;

export const exitOffers = pgTable("exit_offers", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull(),
  subscriptionId: varchar("subscription_id", { length: 255 }).notNull(),
  // Stripe subscription's current_period_start at the time of the offer.
  // Used to enforce "show once per subscription period".
  periodStart: timestamp("period_start"),
  couponId: varchar("coupon_id", { length: 100 }),
  shownAt: timestamp("shown_at").defaultNow(),
  acceptedAt: timestamp("accepted_at"),
  declinedAt: timestamp("declined_at"),
});

export type ExitOffer = typeof exitOffers.$inferSelect;

// Records every lazy DDL migration applied at runtime by the server. The
// `applied_at` value is the exact timestamp captured at the moment the
// migration ran, so downstream backfills can identify pre-migration rows
// by exact match instead of guessing from row-count heuristics.
export const schemaMigrations = pgTable("schema_migrations", {
  name: text("name").primaryKey(),
  appliedAt: timestamp("applied_at").notNull(),
});

export type SchemaMigration = typeof schemaMigrations.$inferSelect;

export const userProgress = pgTable(
  "user_progress",
  {
    id: varchar("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: varchar("user_id", { length: 255 }).notNull(),
    stepId: text("step_id").notNull(),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at"),
    targetCountry: varchar("target_country", { length: 100 }).notNull(),
    // Stamped on first INSERT (seeded when the user first opens the planner
    // for a country). Used by /api/admin/planner-analytics as the
    // `plan_focus_started` timestamp for time-to-100% calculations. Nullable
    // because the lazy migration that added this column originally stamped
    // every pre-existing row with the same NOW(); a one-shot backfill
    // (see backfillUserProgressMigrationCreatedAt) targets exactly those
    // rows by matching against the timestamp recorded in
    // `schema_migrations` at migration time, then rewrites them to the
    // earliest completed_at for the plan or NULL if no completion exists.
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    userStepCountryUnique: uniqueIndex("user_progress_user_step_country_idx").on(
      table.userId,
      table.stepId,
      table.targetCountry,
    ),
  }),
);

export type UserProgress = typeof userProgress.$inferSelect;
