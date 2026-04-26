import type { NextApiRequest, NextApiResponse } from "next";
import {
  backendUrl,
  buildCsrfHeaders,
  copyBackendCookies,
  readBackendError,
} from "@/lib/api-proxy";

// Forwards client-side comment actions to the Go API:
//   POST   /api/comments  { opening_id, body }
//     -> POST   /api/v1/openings/{opening_id}/comments  { body }
//   PATCH  /api/comments  { id, body }
//     -> PATCH  /api/v1/comments/{id}                   { body }
//   DELETE /api/comments?id=…
//     -> DELETE /api/v1/comments/{id}
//
// Backend rejects POST/PATCH/DELETE without verified email — we forward the
// 403 verbatim so the UI can surface it via toast.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "POST") {
    const openingId = String(req.body?.opening_id ?? "");
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!openingId || !body) {
      return res.status(422).json({ error: "opening_id and body are required" });
    }

    const upstream = await fetch(
      backendUrl(`/openings/${encodeURIComponent(openingId)}/comments`),
      {
        method: "POST",
        headers: buildCsrfHeaders(req.headers.cookie, {
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ body }),
      },
    );
    copyBackendCookies(res, upstream);
    if (!upstream.ok) {
      const message = await readBackendError(upstream);
      return res.status(upstream.status).json({ error: message });
    }
    const payload = await upstream.json().catch(() => ({}));
    return res.status(201).json(payload?.data ?? payload);
  }

  if (req.method === "PATCH") {
    const id = String(req.body?.id ?? "");
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!id || !body) {
      return res.status(422).json({ error: "id and body are required" });
    }

    const upstream = await fetch(backendUrl(`/comments/${encodeURIComponent(id)}`), {
      method: "PATCH",
      headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
      body: JSON.stringify({ body }),
    });
    copyBackendCookies(res, upstream);
    if (!upstream.ok) {
      const message = await readBackendError(upstream);
      return res.status(upstream.status).json({ error: message });
    }
    const payload = await upstream.json().catch(() => ({}));
    return res.status(200).json(payload?.data ?? payload);
  }

  if (req.method === "DELETE") {
    const id = String(req.query.id ?? "");
    if (!id) return res.status(422).json({ error: "id is required" });

    const upstream = await fetch(backendUrl(`/comments/${encodeURIComponent(id)}`), {
      method: "DELETE",
      headers: buildCsrfHeaders(req.headers.cookie),
    });
    copyBackendCookies(res, upstream);
    if (!upstream.ok && upstream.status !== 204) {
      const message = await readBackendError(upstream);
      return res.status(upstream.status).json({ error: message });
    }
    return res.status(204).end();
  }

  res.setHeader("Allow", "POST, PATCH, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
