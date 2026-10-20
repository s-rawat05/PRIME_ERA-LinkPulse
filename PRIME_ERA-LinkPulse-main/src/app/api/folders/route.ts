import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { api, readJson } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createFolder, listFolders } from "@/lib/org/service";

export const GET = api(async () => {
  const user = await requireUser();
  return NextResponse.json({ folders: await listFolders(await getDb(), user.id) });
});

export const POST = api(async (req) => {
  const user = await requireUser();
  return NextResponse.json({ folder: await createFolder(await getDb(), user, await readJson(req)) }, { status: 201 });
});
