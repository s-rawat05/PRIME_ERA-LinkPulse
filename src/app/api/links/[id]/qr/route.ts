import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { audit } from "@/lib/audit";
import { getLinkForUser } from "@/lib/links/service";
import { getQrStyle, qrPng, qrSvg, saveQrStyle } from "@/lib/qr";

type Ctx = { params: Promise<{ id: string }> };

/** GET ?format=png|svg[&download=1][&size=] — QR codes encode ?s=qr for scan attribution. */
export const GET = api<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const db = await getDb();
  const link = await getLinkForUser(db, user, id, { allowAdmin: true });
  const p = new URL(req.url).searchParams;
  const style = await getQrStyle(db, link.id);
  const download = p.get("download") === "1";
  const disposition = (ext: string): Record<string, string> =>
    download ? { "Content-Disposition": `attachment; filename="linkpulse-${link.shortCode}.${ext}"` } : {};
  if (p.get("format") === "svg") {
    return new Response(await qrSvg(link.shortCode, style), { headers: { "Content-Type": "image/svg+xml", ...disposition("svg") } });
  }
  const size = Math.min(2048, Math.max(128, Number(p.get("size")) || 1024));
  const png = await qrPng(link.shortCode, style, size);
  return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", ...disposition("png") } });
});

export const PUT = api<Ctx>(async (req, ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  const db = await getDb();
  const link = await getLinkForUser(db, user, id);
  const style = z.object({ fg: z.string().regex(/^#[0-9a-fA-F]{6}$/), bg: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).parse(await readJson(req));
  await saveQrStyle(db, link.id, style);
  await audit(db, { actorId: user.id, action: "qr.style", targetType: "link", targetId: link.id, after: style });
  return NextResponse.json({ ok: true });
});
