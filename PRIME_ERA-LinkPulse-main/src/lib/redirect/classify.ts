import { createHash, createHmac } from "node:crypto";
import { isbot } from "isbot";
import { UAParser } from "ua-parser-js";
import { config } from "@/lib/config";
import type { DeviceType } from "./engine";

// Link-preview fetchers that are sometimes missed by generic lists; isbot covers most of these already.
const PREVIEW_PATTERNS = /(whatsapp|facebookexternalhit|slackbot|slack-imgproxy|telegrambot|discordbot|twitterbot|linkedinbot|skypeuripreview|embedly|vkshare|pinterest|redditbot|applebot|bingpreview|googlebot|mastodon|curl|wget|python-requests|httpclient|go-http-client|okhttp|axios|node-fetch|headless)/i;

export type ClientInfo = {
  isBot: boolean;
  botReason: string | null;
  device: DeviceType;
  os: string | null;
  browser: string | null;
};

export function classifyUserAgent(ua: string | null | undefined, method = "GET"): ClientInfo {
  const agent = (ua ?? "").trim();
  if (method === "HEAD") return { isBot: true, botReason: "HEAD request", device: "bot", os: null, browser: null };
  if (!agent) return { isBot: true, botReason: "empty user agent", device: "bot", os: null, browser: null };
  if (isbot(agent) || PREVIEW_PATTERNS.test(agent)) {
    return { isBot: true, botReason: "known bot / link preview", device: "bot", os: null, browser: agent.split(/[\s/;]/)[0] || null };
  }
  const r = new UAParser(agent).getResult();
  const t = r.device.type;
  const device: DeviceType = t === "mobile" || t === "wearable" ? "mobile" : t === "tablet" ? "tablet" : "desktop";
  return { isBot: false, botReason: null, device, os: r.os.name ?? null, browser: r.browser.name ?? null };
}

export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "0.0.0.0";
}

/** Country/city only from trusted platform headers (Vercel / Cloudflare); never guessed. */
export function geoFromHeaders(headers: Headers): { country: string | null; city: string | null } {
  const country = headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry");
  const cityRaw = headers.get("x-vercel-ip-city");
  let city: string | null = null;
  if (cityRaw) {
    try {
      city = decodeURIComponent(cityRaw);
    } catch {
      city = cityRaw;
    }
  }
  const c = country && /^[A-Z]{2}$/i.test(country) && country.toUpperCase() !== "XX" ? country.toUpperCase() : null;
  return { country: c, city };
}

function utcDay(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Privacy-preserving visitor id: SHA-256(daily salt + link + IP + UA).
 * The daily salt is an HMAC of the server secret and the UTC date; it is never stored, so hashes
 * cannot be linked across days and the raw IP is never persisted.
 */
export function visitorHash(linkId: string | null, ip: string, ua: string, now = Date.now()): string {
  const salt = createHmac("sha256", config.secret).update(`visitor:${utcDay(now)}`).digest("hex");
  return createHash("sha256").update(`${salt}|${linkId ?? "-"}|${ip}|${ua}`).digest("hex").slice(0, 32);
}

/** Rate-limit keys use a hashed IP so even the limiter never stores raw addresses. */
export function ipKey(ip: string): string {
  return createHmac("sha256", config.secret).update(`ip:${ip}`).digest("hex").slice(0, 24);
}
