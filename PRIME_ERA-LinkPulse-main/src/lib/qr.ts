import QRCode from "qrcode";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { qrCodes } from "@/db/schema";
import { shortUrl } from "@/lib/config";

/** QR codes encode `?s=qr` so scans are attributed to the QR source in analytics. */
export function qrTarget(code: string) {
  return `${shortUrl(code)}?s=qr`;
}

export type QrStyle = { fg: string; bg: string };
const HEX = /^#[0-9a-fA-F]{6}$/;

export async function getQrStyle(db: Db, linkId: string): Promise<QrStyle> {
  const [row] = await db.select().from(qrCodes).where(eq(qrCodes.linkId, linkId)).limit(1);
  return { fg: row?.fgColor ?? "#0b1f4d", bg: row?.bgColor ?? "#ffffff" };
}

export async function saveQrStyle(db: Db, linkId: string, style: QrStyle) {
  if (!HEX.test(style.fg) || !HEX.test(style.bg)) throw new Error("Colours must be #RRGGBB");
  await db
    .insert(qrCodes)
    .values({ linkId, fgColor: style.fg, bgColor: style.bg })
    .onConflictDoUpdate({ target: qrCodes.linkId, set: { fgColor: style.fg, bgColor: style.bg, updatedAt: new Date() } });
}

export async function qrPng(code: string, style: QrStyle, size = 1024): Promise<Buffer> {
  return QRCode.toBuffer(qrTarget(code), { type: "png", width: size, margin: 2, errorCorrectionLevel: "M", color: { dark: style.fg, light: style.bg } });
}

export async function qrSvg(code: string, style: QrStyle): Promise<string> {
  return QRCode.toString(qrTarget(code), { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: style.fg, light: style.bg } });
}

export async function qrDataUrl(code: string, style: QrStyle, size = 320): Promise<string> {
  return QRCode.toDataURL(qrTarget(code), { width: size, margin: 2, errorCorrectionLevel: "M", color: { dark: style.fg, light: style.bg } });
}
