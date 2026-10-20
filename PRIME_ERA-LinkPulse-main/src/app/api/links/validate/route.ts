import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { config } from "@/lib/config";
import { validateLinkInput } from "@/lib/links/service";

/** Wizard review step: returns blocking errors and non-blocking warnings without creating anything. */
export const POST = api(async (req) => {
  const user = await requireUser();
  const r = await validateLinkInput(await getDb(), user, await readJson(req), { mode: "create" });
  const warnings = [...r.warnings];
  if (!config.safeBrowsingKey) warnings.push("External URL scanning (Google Safe Browsing) is not configured; only the domain blocklist is checked.");
  return NextResponse.json({ ok: r.ok, errors: r.errors, warnings, alias: r.normalized?.alias ?? null });
});
