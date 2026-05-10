import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const b = req.body ?? {};
  const upstream = await fetch(backendUrl("/uploads/cover"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      filename: b.filename ?? "",
      content_type: b.content_type ?? "",
      entity_type: b.entity_type ?? "",
    }),
  });

  copyBackendCookies(res, upstream);

  if (!upstream.ok) {
    const payload = await upstream.json().catch(() => ({}));
    return res.status(upstream.status).json({ error: payload?.error?.message ?? "Upload init failed" });
  }

  const payload = await upstream.json();
  return res.status(200).json(payload.data);
}
