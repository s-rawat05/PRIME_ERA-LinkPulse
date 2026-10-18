import { z } from "zod";
import type { Db } from "@/db";
import type { SessionUser } from "@/lib/auth/users";
import { getLinkForUser } from "@/lib/links/service";
import { evaluate, type Evaluation } from "./engine";
import { loadSnapshot } from "./resolve";

export const simulateSchema = z.object({
  linkId: z.uuid(),
  device: z.enum(["desktop", "mobile", "tablet", "bot"]).default("desktop"),
  os: z.string().trim().max(30).optional().nullable(),
  country: z.string().trim().max(2).optional().nullable(),
  password: z.enum(["none", "correct", "wrong"]).default("none"),
  statusOverride: z.enum(["actual", "active", "paused", "disabled"]).default("actual"),
  at: z.string().optional().nullable(), // ISO time to simulate (e.g. after expiry)
  clickCountOverride: z.coerce.number().int().min(0).optional().nullable(),
});

export type SimulationResult = Evaluation & {
  simulated: true;
  link: { shortCode: string; destinationUrl: string; status: string; maxClicks: number | null; clickCount: number; hasPassword: boolean; expiresAt: number | null; ruleCount: number };
  request: { device: string; os: string | null; country: string | null; password: string; at: string };
};

/**
 * Runs the production rule engine against a link the user owns with hypothetical request
 * attributes. Nothing is written: no click event, no counter change, no cache change.
 */
export async function simulate(db: Db, user: SessionUser, raw: unknown): Promise<SimulationResult> {
  const input = simulateSchema.parse(raw);
  const link = await getLinkForUser(db, user, input.linkId, { allowAdmin: true });
  const snap = await loadSnapshot(db, link.shortCode);
  if (!snap) throw new Error("Link snapshot unavailable");
  if (input.statusOverride !== "actual") snap.status = input.statusOverride;
  if (input.clickCountOverride != null) snap.clickCount = input.clickCountOverride;
  const at = input.at && !Number.isNaN(Date.parse(input.at)) ? Date.parse(input.at) : Date.now();
  const os = input.os || (input.device === "mobile" ? "Android" : input.device === "desktop" ? "Windows" : null);
  const country = input.country ? input.country.toUpperCase() : null;
  const ev = evaluate(snap, { now: at, isBot: input.device === "bot", device: input.device, os, country, password: input.password, simulateCap: true });
  return {
    ...ev,
    simulated: true,
    link: { shortCode: snap.shortCode, destinationUrl: snap.destinationUrl, status: snap.status, maxClicks: snap.maxClicks, clickCount: snap.clickCount, hasPassword: snap.hasPassword, expiresAt: snap.expiresAt, ruleCount: snap.rules.length },
    request: { device: input.device, os, country, password: input.password, at: new Date(at).toISOString() },
  };
}
