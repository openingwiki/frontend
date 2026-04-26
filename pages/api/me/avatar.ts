import type { NextApiRequest, NextApiResponse } from "next";
import {
  backendUrl,
  buildCsrfHeaders,
  copyBackendCookies,
  readBackendError,
} from "@/lib/api-proxy";

// Two flows surfaced to the client:
//   POST   /api/me/avatar  multipart/form-data file=…   →  upload + attach
//   DELETE /api/me/avatar                                →  clear current
//
// Avatar upload is a 3-step dance against the Go API:
//   1) POST /uploads/avatar { filename, content_type } → presigned PUT URL
//   2) PUT  <upload_url> with the file bytes (S3-style direct upload)
//   3) PUT  /me/avatar { object_key } → attaches the object to the user
// We collapse all three into this one server-side handler so the browser
// only has to deal with a normal multipart POST.

export const config = {
  api: {
    bodyParser: false, // we read the raw multipart stream ourselves
  },
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

// Minimal multipart parser — pulls a single named file part.
// We accept just one file; users can re-upload to replace.
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

    const headerStart = startBoundary + sep.length + 2; // skip CRLF
    const headerEnd = raw.indexOf(CRLFCRLF, headerStart);
    if (headerEnd < 0) break;
    const headers = raw.slice(headerStart, headerEnd).toString("utf8");
    const dispMatch = headers.match(/Content-Disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
    const ctMatch = headers.match(/Content-Type:\s*([^\r\n]+)/i);

    const bodyStart = headerEnd + CRLFCRLF.length;
    const nextBoundary = raw.indexOf(sep, bodyStart);
    const bodyEnd = nextBoundary > 0 ? nextBoundary - 2 : raw.length; // strip CRLF
    const body = raw.slice(bodyStart, bodyEnd);

    if (dispMatch && dispMatch[1] === fieldName && dispMatch[2] !== undefined) {
      return {
        filename: dispMatch[2] || "avatar",
        contentType: (ctMatch?.[1] ?? "application/octet-stream").trim(),
        body,
      };
    }
    cursor = nextBoundary > 0 ? nextBoundary : raw.length;
  }
  return null;
}

async function deleteAvatar(req: NextApiRequest, res: NextApiResponse) {
  const upstream = await fetch(backendUrl("/me/avatar"), {
    method: "DELETE",
    headers: buildCsrfHeaders(req.headers.cookie),
  });
  copyBackendCookies(res, upstream);
  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.status(upstream.status).json({ error: message });
  }
  const payload = await upstream.json().catch(() => ({}));
  return res.status(200).json(payload?.data ?? payload);
}

async function uploadAvatar(req: NextApiRequest, res: NextApiResponse) {
  const ct = req.headers["content-type"] ?? "";
  const m = /boundary=([^;]+)/i.exec(ct);
  if (!m) return res.status(400).json({ error: "Expected multipart/form-data" });
  const boundary = m[1].trim().replace(/^"|"$/g, "");

  let raw: Buffer;
  try {
    raw = await readBody(req);
  } catch (err) {
    return res
      .status(413)
      .json({ error: err instanceof Error ? err.message : "Read failed" });
  }
  if (raw.length > MAX_BYTES) {
    return res.status(413).json({ error: "Max size 5 MB" });
  }

  const part = extractFilePart(raw, boundary, "file");
  if (!part) return res.status(400).json({ error: "Missing file field" });
  if (!ALLOWED.has(part.contentType)) {
    return res.status(415).json({ error: "Use JPEG, PNG or WebP" });
  }

  // 1) Ask backend for a presigned upload target.
  const presignRes = await fetch(backendUrl("/uploads/avatar"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ filename: part.filename, content_type: part.contentType }),
  });
  copyBackendCookies(res, presignRes);
  if (!presignRes.ok) {
    const message = await readBackendError(presignRes);
    return res.status(presignRes.status).json({ error: message });
  }
  const presign = (await presignRes.json()).data as {
    object_key: string;
    upload_url: string;
    headers?: Record<string, string>;
    max_bytes?: number;
  };
  if (presign.max_bytes && part.body.length > presign.max_bytes) {
    return res.status(413).json({ error: `Max size ${presign.max_bytes} bytes` });
  }

  // 2) Upload the bytes directly to the storage URL.
  const putRes = await fetch(presign.upload_url, {
    method: "PUT",
    headers: { "Content-Type": part.contentType, ...(presign.headers ?? {}) },
    body: part.body,
  });
  if (!putRes.ok) {
    return res
      .status(502)
      .json({ error: `Upload to storage failed (${putRes.status})` });
  }

  // 3) Tell the backend to attach the freshly-uploaded object to this user.
  const attachRes = await fetch(backendUrl("/me/avatar"), {
    method: "PUT",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ object_key: presign.object_key }),
  });
  copyBackendCookies(res, attachRes);
  if (!attachRes.ok) {
    const message = await readBackendError(attachRes);
    return res.status(attachRes.status).json({ error: message });
  }
  const payload = await attachRes.json().catch(() => ({}));
  return res.status(200).json(payload?.data ?? payload);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") return uploadAvatar(req, res);
  if (req.method === "DELETE") return deleteAvatar(req, res);
  res.setHeader("Allow", "POST, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
