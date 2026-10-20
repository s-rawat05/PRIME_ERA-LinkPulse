import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { runImport } from "@/lib/csv/import";
import { readCsvUpload } from "@/lib/csv/upload";
import { tooMany } from "@/lib/errors";
import { rateLimit } from "@/lib/ratelimit";

export const maxDuration = 60;

export const POST = api(async (req) => {
  const user = await requireUser();
  if (!(await rateLimit("import", user.id)).ok) throw tooMany("Too many imports. Please wait a minute.");
  const { filename, text } = await readCsvUpload(req);
  return NextResponse.json(await runImport(await getDb(), user, filename, text));
});
