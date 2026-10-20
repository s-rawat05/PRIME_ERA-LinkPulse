import "server-only";
import { badRequest } from "@/lib/errors";
import { MAX_BYTES } from "./import";

/** Reads a CSV from multipart form data (`file`) or a raw text/csv body. */
export async function readCsvUpload(req: Request): Promise<{ filename: string; text: string }> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw badRequest("Attach a CSV file in the \"file\" field.");
    if (file.size > MAX_BYTES) throw badRequest("File is larger than 1 MB.");
    if (!/\.(csv|txt)$/i.test(file.name) && !/csv|text\/plain/.test(file.type)) throw badRequest("Only .csv files are supported.");
    return { filename: file.name, text: await file.text() };
  }
  const text = await req.text();
  if (text.length > MAX_BYTES) throw badRequest("File is larger than 1 MB.");
  return { filename: "upload.csv", text };
}
