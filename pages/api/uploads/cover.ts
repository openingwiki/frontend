import type { NextApiRequest, NextApiResponse } from "next";
import {
  backendUrl,
  buildCsrfHeaders,
  copyBackendCookies,
  readBackendError,
} from "@/lib/api-proxy";

// Cover upload — server-side 2-step dance so the browser never hits S3 directly
// (avoids CORS issues with the storage backend):
//   1) POST /uploads/cover { filename, content_type, entity_type } → presigned PUT URL
//   2) PUT  <upload_url> with the file bytes (server-side, no CORS)
//   Returns { object_key, public_url } to the client.
//
// Request: POST /api/uploads/cover?entity_type=anime  multipart/form-data  file=…

export const config = {
  api: { bodyParser: false },
};

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

async function readBody(req: NextApiRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
    if (chunks.reduce((n, c) => n + c.length, 0) > MAX_BYTES + 4096) {
      throw new Error("File too large");
    }
  }
  return Buffer.concat(chunks);
}

function extractFilePart(
  raw: Buffer,
  boundary: string,
  fieldName = "file",
): { filename: string; contentType: string; body: Buffer } | null {
  const sep = Buffer.from(`--${boundary}`);
  const end = Buffer.from(`--${boundary}--`);
  const CRLFCRLF = Buffer.from("\r\n\r\n");
  let cursor = 0;
  while (cursor < raw.length) {
    const startBoundary = raw.indexOf(sep, cursor);
    if (startBoundary < 0) break;
    if (raw.slice(startBoundary, startBoundary + end.length).equals(end)) break;
    const headerStart = startBoundary + sep.length + 2;
    const headerEnd = raw.indexOf(CRLFCRLF, headerStart);
    if (headerEnd < 0) break;
    const headers = raw.slice(headerStart, headerEnd).toString("utf8");
    const dispMatch = headers.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    const ctMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);
    const bodyStart = headerEnd + CRLFCRLF.length;
    const nextBoundary = raw.indexOf(sep, bodyStart);
    const bodyEnd = nextBoundary > 0 ? nextBoundary - 2 : raw.length;
    const body = raw.slice(bodyStart, bodyEnd);
    if (dispMatch && dispMatch[1] === fieldName && dispMatch[2] !== undefined) {
      return {
        filename: dispMatch[2] || "cover",
        contentType: (ctMatch?.[1] ?? "application/octet-stream").trim(),
        body,
      };
    }
    cursor = nextBoundary > 0 ? nextBoundary : raw.length;
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const entityType = (req.query.entity_type as string) ?? "";
  if (entityType !== "anime" && entityType !== "singer") {
    return res.status(400).json({ error: "entity_type must be anime or singer" });
  }

  const ct = req.headers["content-type"] ?? "";
  const m = /boundary=([^;]+)/i.exec(ct);
  if (!m) return res.status(400).json({ error: "Expected multipart/form-data" });
  const boundary = m[1].trim().replace(/^"|"$/g, "");

  let raw: Buffer;
  try {
    raw = await readBody(req);
  } catch (err) {
    return res.status(413).json({ error: err instanceof Error ? err.message : "Read failed" });
  }
  if (raw.length > MAX_BYTES) return res.status(413).json({ error: "Max size 5 MB" });

  const part = extractFilePart(raw, boundary, "file");
  if (!part) return res.status(400).json({ error: "Missing file field" });
  if (!ALLOWED.has(part.contentType)) {
    return res.status(415).json({ error: "Use JPEG, PNG or WebP" });
  }

  // 1) Get presigned URL from backend
  const presignRes = await fetch(backendUrl("/uploads/cover"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ filename: part.filename, content_type: part.contentType, entity_type: entityType }),
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
    max_bytes?: number;
  };
  if (presign.max_bytes && part.body.length > presign.max_bytes) {
    return res.status(413).json({ error: `Max size ${presign.max_bytes} bytes` });
  }

  // 2) PUT bytes to S3 server-side — no browser CORS involved
  const putRes = await fetch(presign.upload_url, {
    method: "PUT",
    headers: { "Content-Type": part.contentType, ...(presign.headers ?? {}) },
    body: part.body,
  });
  if (!putRes.ok) {
    return res.status(502).json({ error: `Storage upload failed (${putRes.status})` });
  }

  return res.status(200).json({ object_key: presign.object_key, public_url: presign.public_url });
}
