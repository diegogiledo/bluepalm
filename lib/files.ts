import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import { isSupabase } from "./db";
import { newToken } from "./auth";

/**
 * Private document storage (insurance certificates).
 * Supabase Storage bucket "detailer-docs" (private) when configured,
 * otherwise ./data/uploads. Files are only served through the admin route.
 */
const BUCKET = "detailer-docs";
const LOCAL = path.join(process.cwd(), "data", "uploads");
export const ALLOWED = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" } as const;
export const MAX_BYTES = 8 * 1024 * 1024;

function sniff(buf: Buffer): keyof typeof ALLOWED | null {
  if (buf.subarray(0, 4).toString() === "%PDF") return "application/pdf";
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  return null;
}

export async function saveDocument(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new Error("File must be 8 MB or smaller.");
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf); // trust file contents, not the client-supplied type
  if (!type) throw new Error("Upload a PDF, JPG or PNG file.");
  const name = `${newToken(18)}.${ALLOWED[type]}`;
  if (isSupabase) {
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { error } = await sb.storage.from(BUCKET).upload(name, buf, { contentType: type });
    if (error) throw new Error("Upload failed: " + error.message);
  } else {
    await fs.mkdir(LOCAL, { recursive: true });
    await fs.writeFile(path.join(LOCAL, name), buf);
  }
  return name;
}

export async function readDocument(name: string): Promise<{ body: Buffer; type: string } | null> {
  if (!/^[A-Za-z0-9_-]+\.(pdf|jpg|png)$/.test(name)) return null;
  const type = name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : "image/jpeg";
  if (isSupabase) {
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data, error } = await sb.storage.from(BUCKET).download(name);
    if (error || !data) return null;
    return { body: Buffer.from(await data.arrayBuffer()), type };
  }
  try { return { body: await fs.readFile(path.join(LOCAL, name)), type }; } catch { return null; }
}
