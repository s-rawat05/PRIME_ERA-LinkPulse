import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError, forbidden } from "@/lib/errors";

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

/**
 * Wraps a Route Handler: CSRF origin check for mutations, JSON error mapping, and no leaking of
 * internal error details to clients.
 */
export function api<C = unknown>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      const res = await handler(req, ctx);
      res.headers.set("Cache-Control", "no-store");
      return res;
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json({ error: err.message, code: err.code, fields: err.fields }, { status: err.status, headers: { "Cache-Control": "no-store" } });
      }
      if (err instanceof ZodError) {
        const fields = Object.fromEntries(err.issues.map((i) => [i.path.join(".") || "_", i.message]));
        return NextResponse.json({ error: "Validation failed.", code: "invalid", fields }, { status: 400 });
      }
      console.error("[api] unhandled error", err);
      return NextResponse.json({ error: "Something went wrong on our side.", code: "internal" }, { status: 500 });
    }
  };
}

/** Cookie auth uses SameSite=Lax; this additionally rejects cross-site mutation requests. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, server-to-server) send no Origin
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host !== host) throw forbidden("Cross-site request rejected.");
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw forbidden("Cross-site request rejected.");
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new AppError(400, "invalid", "Request body must be valid JSON.");
  }
}
