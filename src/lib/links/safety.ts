import { inArray } from "drizzle-orm";
import type { Db } from "@/db";
import { blockedDomains } from "@/db/schema";
import { config } from "@/lib/config";
import { hostCandidates } from "./url";

/** Returns the matching blocklist entry when the host or any parent domain is blocked. */
export async function findBlockedDomain(db: Db, host: string): Promise<string | null> {
  const cands = hostCandidates(host);
  if (!cands.length) return null;
  const rows = await db.select({ domain: blockedDomains.domain }).from(blockedDomains).where(inArray(blockedDomains.domain, cands)).limit(1);
  return rows[0]?.domain ?? null;
}

export async function blockedHostSet(db: Db, hosts: string[]): Promise<Set<string>> {
  const cands = [...new Set(hosts.flatMap(hostCandidates))];
  if (!cands.length) return new Set();
  const rows = await db.select({ domain: blockedDomains.domain }).from(blockedDomains).where(inArray(blockedDomains.domain, cands));
  const blocked = new Set(rows.map((r) => r.domain));
  return new Set(hosts.filter((h) => hostCandidates(h).some((c) => blocked.has(c))));
}

export type ScanResult = { status: "safe" | "flagged" | "not_scanned"; detail: string };

/**
 * Google Safe Browsing v4 Lookup API. Runs only when GOOGLE_SAFE_BROWSING_API_KEY is configured;
 * otherwise the link is honestly recorded as "not_scanned".
 */
export async function scanUrl(url: string): Promise<ScanResult> {
  const key = config.safeBrowsingKey;
  if (!key) return { status: "not_scanned", detail: "External URL scanning is not enabled (no Safe Browsing API key configured)." };
  try {
    const res = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(3000),
      body: JSON.stringify({
        client: { clientId: "linkpulse", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }],
        },
      }),
    });
    if (!res.ok) return { status: "not_scanned", detail: `Safe Browsing returned HTTP ${res.status}; scan skipped.` };
    const body = (await res.json()) as { matches?: { threatType: string }[] };
    if (body.matches?.length) return { status: "flagged", detail: `Flagged by Google Safe Browsing: ${body.matches.map((m) => m.threatType).join(", ")}` };
    return { status: "safe", detail: "No threats found by Google Safe Browsing." };
  } catch {
    return { status: "not_scanned", detail: "Safe Browsing request failed or timed out; scan skipped." };
  }
}
