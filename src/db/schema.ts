import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const linkStatus = pgEnum("link_status", ["active", "paused", "disabled"]);
export const clickOutcome = pgEnum("click_outcome", [
  "redirected",
  "not_found",
  "disabled",
  "paused",
  "expired",
  "password_failed",
  "limit_reached",
  "bot",
]);
export const clickSource = pgEnum("click_source", ["link", "qr"]);
export const ruleCondition = pgEnum("rule_condition", ["device", "os", "country"]);
export const safetyStatus = pgEnum("safety_status", ["not_scanned", "safe", "flagged"]);
export const importRowStatus = pgEnum("import_row_status", ["imported", "rejected", "skipped"]);

// ---------- Organisation ----------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("user"),
  disabledAt: ts("disabled_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("users_email_uq").on(t.email),
  check("users_email_lower", sql`${t.email} = lower(${t.email})`),
]);

export const sessions = pgTable("sessions", {
  // SHA-256 of the session token; the raw token only lives in the cookie.
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("sessions_user_idx").on(t.userId)]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("workspaces_owner_idx").on(t.ownerId)]);

export const folders = pgTable("folders", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  parentId: uuid("parent_id"),
  name: text("name").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("folders_owner_name_uq").on(t.ownerId, t.name)]);

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  utmSource: text("utm_source"),
  utmMedium: text("utm_medium"),
  utmCampaign: text("utm_campaign"),
  startsAt: ts("starts_at"),
  endsAt: ts("ends_at"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("campaigns_owner_name_uq").on(t.ownerId, t.name)]);

export const tags = pgTable("tags", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("#3b82f6"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("tags_owner_name_uq").on(t.ownerId, t.name)]);

// ---------- Core link ----------

export const links = pgTable("links", {
  id: uuid("id").primaryKey().defaultRandom(),
  shortCode: text("short_code").notNull(),
  title: text("title"),
  destinationUrl: text("destination_url").notNull(),
  destinationHost: text("destination_host").notNull(),
  status: linkStatus("status").notNull().default("active"),
  isCustomAlias: boolean("is_custom_alias").notNull().default(false),
  expiresAt: ts("expires_at"),
  expiredUrl: text("expired_url"),
  maxClicks: integer("max_clicks"),
  clickCount: integer("click_count").notNull().default(0),
  passwordHash: text("password_hash"),
  campaignId: uuid("campaign_id").references(() => campaigns.id, { onDelete: "set null" }),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  safetyStatus: safetyStatus("safety_status").notNull().default("not_scanned"),
  disabledReason: text("disabled_reason"),
  disabledBy: uuid("disabled_by").references(() => users.id, { onDelete: "set null" }),
  disabledAt: ts("disabled_at"),
  deletedAt: ts("deleted_at"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [
  uniqueIndex("links_short_code_uq").on(t.shortCode),
  index("links_owner_idx").on(t.ownerId, t.createdAt),
  index("links_campaign_idx").on(t.campaignId),
  index("links_host_idx").on(t.destinationHost),
  check("links_code_lower", sql`${t.shortCode} = lower(${t.shortCode})`),
  check("links_max_clicks_pos", sql`${t.maxClicks} IS NULL OR ${t.maxClicks} > 0`),
  check("links_click_count_nonneg", sql`${t.clickCount} >= 0`),
]);

export const linkTags = pgTable("link_tags", {
  linkId: uuid("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  tagId: uuid("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" }),
}, (t) => [primaryKey({ columns: [t.linkId, t.tagId] }), index("link_tags_tag_idx").on(t.tagId)]);

export const redirectRules = pgTable("redirect_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  linkId: uuid("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  priority: integer("priority").notNull(),
  conditionType: ruleCondition("condition_type").notNull(),
  conditionValue: text("condition_value").notNull(),
  targetUrl: text("target_url").notNull(),
  targetHost: text("target_host").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("redirect_rules_link_priority_uq").on(t.linkId, t.priority)]);

export const qrCodes = pgTable("qr_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  linkId: uuid("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  fgColor: text("fg_color").notNull().default("#0b1f4d"),
  bgColor: text("bg_color").notNull().default("#ffffff"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("qr_codes_link_uq").on(t.linkId)]);

// ---------- Events & analytics ----------

export const clickEvents = pgTable("click_events", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  // Nullable so visits to unknown codes are still recorded (outcome = not_found).
  linkId: uuid("link_id").references(() => links.id, { onDelete: "set null" }),
  attemptedCode: text("attempted_code").notNull(),
  occurredAt: ts("occurred_at").notNull().defaultNow(),
  outcome: clickOutcome("outcome").notNull(),
  source: clickSource("source").notNull().default("link"),
  isBot: boolean("is_bot").notNull().default(false),
  referrerDomain: text("referrer_domain"),
  country: text("country"),
  city: text("city"),
  device: text("device").notNull().default("unknown"),
  os: text("os"),
  browser: text("browser"),
  ruleId: uuid("rule_id"),
  visitorHash: text("visitor_hash"),
  latencyMs: real("latency_ms"),
  isSynthetic: boolean("is_synthetic").notNull().default(false),
}, (t) => [
  index("click_events_link_time_idx").on(t.linkId, t.occurredAt),
  index("click_events_time_idx").on(t.occurredAt),
  index("click_events_outcome_idx").on(t.outcome, t.occurredAt),
]);

export const linkStatsDaily = pgTable("link_stats_daily", {
  linkId: uuid("link_id").notNull().references(() => links.id, { onDelete: "cascade" }),
  day: date("day", { mode: "string" }).notNull(),
  clicks: integer("clicks").notNull().default(0),
  uniques: integer("uniques").notNull().default(0),
  botHits: integer("bot_hits").notNull().default(0),
  qrScans: integer("qr_scans").notNull().default(0),
  blocked: integer("blocked").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.linkId, t.day] })]);

// ---------- Governance ----------

export const blockedDomains = pgTable("blocked_domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  domain: text("domain").notNull(),
  reason: text("reason"),
  addedBy: uuid("added_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [uniqueIndex("blocked_domains_domain_uq").on(t.domain)]);

export const auditLog = pgTable("audit_log", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("audit_log_time_idx").on(t.createdAt), index("audit_log_actor_idx").on(t.actorId)]);

export const importJobs = pgTable("import_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  filename: text("filename").notNull(),
  totalRows: integer("total_rows").notNull().default(0),
  importedRows: integer("imported_rows").notNull().default(0),
  rejectedRows: integer("rejected_rows").notNull().default(0),
  skippedRows: integer("skipped_rows").notNull().default(0),
  createdAt: ts("created_at").notNull().defaultNow(),
}, (t) => [index("import_jobs_owner_idx").on(t.ownerId, t.createdAt)]);

export const importRows = pgTable("import_rows", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  jobId: uuid("job_id").notNull().references(() => importJobs.id, { onDelete: "cascade" }),
  rowNumber: integer("row_number").notNull(),
  raw: jsonb("raw").notNull(),
  status: importRowStatus("status").notNull(),
  errors: jsonb("errors").$type<string[]>().notNull().default([]),
  linkId: uuid("link_id").references(() => links.id, { onDelete: "set null" }),
}, (t) => [index("import_rows_job_idx").on(t.jobId, t.rowNumber)]);

// Fixed-window counters used when Upstash Redis is not configured.
export const rateLimits = pgTable("rate_limits", {
  key: text("key").notNull(),
  windowStart: ts("window_start").notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.key, t.windowStart] })]);

// ---------- Relations ----------

export const linksRelations = relations(links, ({ one, many }) => ({
  owner: one(users, { fields: [links.ownerId], references: [users.id] }),
  campaign: one(campaigns, { fields: [links.campaignId], references: [campaigns.id] }),
  folder: one(folders, { fields: [links.folderId], references: [folders.id] }),
  linkTags: many(linkTags),
  rules: many(redirectRules),
}));

export const linkTagsRelations = relations(linkTags, ({ one }) => ({
  link: one(links, { fields: [linkTags.linkId], references: [links.id] }),
  tag: one(tags, { fields: [linkTags.tagId], references: [tags.id] }),
}));

export const redirectRulesRelations = relations(redirectRules, ({ one }) => ({
  link: one(links, { fields: [redirectRules.linkId], references: [links.id] }),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({ links: many(links) }));
export const tagsRelations = relations(tags, ({ many }) => ({ linkTags: many(linkTags) }));

export type User = typeof users.$inferSelect;
export type Link = typeof links.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type RedirectRule = typeof redirectRules.$inferSelect;
export type ClickOutcome = (typeof clickOutcome.enumValues)[number];
export type ClickSource = (typeof clickSource.enumValues)[number];
