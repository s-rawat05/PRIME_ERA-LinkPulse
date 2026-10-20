import { isIP } from "node:net";
import { shortHost } from "@/lib/config";

export type UrlCheck =
  | { ok: true; url: string; host: string }
  | { ok: false; reason: string };

const MAX_URL_LENGTH = 2048;

function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  const bare = host.replace(/^\[|\]$/g, "");
  const kind = isIP(bare);
  if (kind === 4) {
    const [a, b] = bare.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (kind === 6) {
    const l = bare.toLowerCase();
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  return false;
}

/**
 * Server-side destination validation. Only absolute http(s) URLs to public hosts are accepted,
 * credentials in URLs are rejected, and links pointing back at this shortener are refused to
 * prevent redirect loops / open-redirect chains.
 */
export function validateDestination(input: string): UrlCheck {
  const raw = (input ?? "").trim();
  if (!raw) return { ok: false, reason: "Destination URL is required." };
  if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: `URL is longer than ${MAX_URL_LENGTH} characters.` };
  if (/[\s<>"]/.test(raw)) return { ok: false, reason: "URL contains spaces or illegal characters." };

  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, reason: "Not a valid absolute URL (include https://)." };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    return { ok: false, reason: `Unsafe scheme "${u.protocol.replace(":", "")}". Only http and https are allowed.` };
  }
  if (u.username || u.password) return { ok: false, reason: "URLs with embedded credentials are not allowed." };
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) return { ok: false, reason: "URL has no host." };
  if (isPrivateHost(host)) return { ok: false, reason: "Private, local or internal addresses are not allowed." };
  if (!host.includes(".") && !isIP(host.replace(/^\[|\]$/g, ""))) return { ok: false, reason: "Host must be a fully-qualified domain name." };
  if (u.host.toLowerCase() === shortHost().toLowerCase()) {
    return { ok: false, reason: "Cannot shorten a LinkPulse short link (redirect loop)." };
  }
  return { ok: true, url: u.toString(), host };
}

/** "a.b.example.com" -> ["a.b.example.com", "b.example.com", "example.com"] */
export function hostCandidates(host: string): string[] {
  const parts = host.toLowerCase().split(".");
  const out: string[] = [];
  for (let i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

export function normalizeDomain(input: string): string | null {
  let d = input.trim().toLowerCase();
  if (!d) return null;
  if (d.includes("://")) {
    try {
      d = new URL(d).hostname;
    } catch {
      return null;
    }
  }
  d = d.replace(/^\*\./, "").replace(/^www\./, "").replace(/\.$/, "").split("/")[0];
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d) ? d : null;
}

export function referrerDomain(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}
