import { after } from "next/server";
import { getDb } from "@/db";
import { handleRedirect, recordClick, type RedirectResult } from "@/lib/redirect/resolve";
import { renderStatusPage } from "@/lib/redirect/pages";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

// Browsers cache 301s; 302 + no-store keeps every visit flowing through the rule engine,
// so takedowns, expiry and click logging always apply.
const NO_STORE = { "Cache-Control": "no-store, no-cache, must-revalidate, private", "X-Robots-Tag": "noindex" };

function respond(r: RedirectResult, method: string): Response {
  if (r.event) {
    const db = getDb();
    after(async () => {
      try {
        await recordClick(await db, r);
      } catch (err) {
        console.error("[redirect] failed to record click event", err);
      }
    });
  }
  if (r.location) {
    return new Response(null, { status: 302, headers: { ...NO_STORE, Location: r.location, "Referrer-Policy": "strict-origin-when-cross-origin" } });
  }
  const html = method === "HEAD" ? null : renderStatusPage(r.page!.kind, r.page!.code, { error: r.page!.error, qr: r.page!.qr });
  return new Response(html, { status: r.status, headers: { ...NO_STORE, "Content-Type": "text/html; charset=utf-8" } });
}

async function run(req: Request, ctx: Ctx, password?: string | null) {
  const { code } = await ctx.params;
  const url = new URL(req.url);
  const db = await getDb();
  const r = await handleRedirect(db, { code, method: req.method, headers: req.headers, searchParams: url.searchParams, password });
  return respond(r, req.method);
}

export async function GET(req: Request, ctx: Ctx) {
  return run(req, ctx);
}

export async function HEAD(req: Request, ctx: Ctx) {
  return run(req, ctx);
}

/** Password form submission. */
export async function POST(req: Request, ctx: Ctx) {
  let password = "";
  try {
    const form = await req.formData();
    password = String(form.get("password") ?? "").slice(0, 128);
  } catch {
    password = "";
  }
  return run(req, ctx, password);
}
