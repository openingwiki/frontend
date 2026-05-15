import type { NextApiRequest, NextApiResponse } from "next";
import {
  backendUrl,
  buildCsrfHeaders,
  copyBackendCookies,
  readBackendError,
} from "@/lib/api-proxy";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url, entity_type } = req.body as { url?: string; entity_type?: string };
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "url is required" });
  }
  if (entity_type !== "anime" && entity_type !== "singer") {
    return res.status(400).json({ error: "entity_type must be anime or singer" });
  }

  let imageRes: Response;
  try {
    imageRes = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!imageRes.ok) throw new Error(`Remote responded ${imageRes.status}`);
  } catch {
    return res.status(502).json({ error: "Failed to download image" });
  }

  const rawCt = imageRes.headers.get("content-type")?.split(";")[0].trim() ?? "";
  const contentType = rawCt === "image/jpg" ? "image/jpeg" : rawCt;
  if (!ALLOWED.has(contentType)) {
    return res.status(415).json({ error: "Remote image must be JPEG, PNG, or WebP" });
  }

  const bytes = Buffer.from(await imageRes.arrayBuffer());
  if (bytes.length > MAX_BYTES) {
    return res.status(413).json({ error: "Image exceeds 5 MB" });
  }

  const ext = contentType.split("/")[1];
  const filename = `cover.${ext}`;

  const presignRes = await fetch(backendUrl("/uploads/cover"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ filename, content_type: contentType, entity_type }),
  });
  copyBackendCookies(res, presignRes);
  if (!presignRes.ok) {
    const message = await readBackendError(presignRes);
    return res.status(presignRes.status).json({ error: message });
  }

  const presign = (await presignRes.json()).data as {
    object_key: string;
    upload_url: string;
    public_url: string;
    headers?: Record<string, string>;
  };

  const putRes = await fetch(presign.upload_url, {
    method: "PUT",
    headers: { "Content-Type": contentType, ...(presign.headers ?? {}) },
    body: bytes,
  });
  if (!putRes.ok) {
    return res.status(502).json({ error: `Storage upload failed (${putRes.status})` });
  }

  return res.status(200).json({ object_key: presign.object_key, public_url: presign.public_url });
}
