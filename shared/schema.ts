import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
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
