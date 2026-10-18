import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
export const CODE_LENGTH = 7; // 36^7 ≈ 78 billion combinations

/** Uniformly random base36 code using rejection sampling (no modulo bias). */
export function generateShortCode(length = CODE_LENGTH): string {
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length * 2);
    for (const b of bytes) {
      if (b < 252) out += ALPHABET[b % 36]; // 252 = 7 * 36
      if (out.length === length) break;
    }
  }
  return out;
}

/**
 * Every top-level route segment the app owns must be reserved, otherwise an alias could
 * shadow (or be shadowed by) an application page.
 */
export const RESERVED_ALIASES = new Set([
  "api", "app", "admin", "administrator", "dashboard", "login", "logout", "signin", "signout",
  "sign-in", "sign-up", "register", "signup", "auth", "settings", "account", "links", "link",
  "campaigns", "analytics", "qr", "qrcodes", "qr-codes", "import", "simulator", "help", "docs",
  "about", "pricing", "features", "terms", "privacy", "security", "static", "public", "assets",
  "images", "_next", "favicon.ico", "robots.txt", "sitemap.xml", "health", "status", "www",
  "mail", "root", "support", "unlock", "blocked", "null", "undefined", "linkpulse",
]);

export const ALIAS_RULES = "3–32 characters: lowercase letters, numbers, hyphens or underscores; must start and end with a letter or number.";
const ALIAS_RE = /^[a-z0-9](?:[a-z0-9_-]{1,30})[a-z0-9]$/;

export function normalizeAlias(input: string): string {
  return input.trim().toLowerCase();
}

export type AliasCheck = { ok: true; alias: string } | { ok: false; alias: string; reason: string };

export function validateAliasFormat(input: string): AliasCheck {
  const alias = normalizeAlias(input);
  if (!ALIAS_RE.test(alias)) return { ok: false, alias, reason: `Invalid alias. ${ALIAS_RULES}` };
  if (RESERVED_ALIASES.has(alias)) return { ok: false, alias, reason: `"${alias}" is a reserved word and cannot be used.` };
  return { ok: true, alias };
}

/** Codes arriving on the redirect path are normalised the same way aliases are stored. */
export function normalizeIncomingCode(code: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(code);
  } catch {
    return null;
  }
  const c = decoded.trim().toLowerCase();
  return /^[a-z0-9_-]{1,64}$/.test(c) ? c : null;
}
