import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp, varchar, integer, jsonb } from "drizzle-orm/pg-core";
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
