import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { previewImport } from "@/lib/csv/import";
import { readCsvUpload } from "@/lib/csv/upload";

export const POST = api(async (req) => {
  const user = await requireUser();
  const { filename, text } = await readCsvUpload(req);
  return NextResponse.json(await previewImport(await getDb(), user, filename, text));
});
