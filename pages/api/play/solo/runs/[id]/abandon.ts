import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

// POST /api/play/solo/runs/{id}/abandon — mark a run as abandoned.
// Wired to the Exit-run button and the 15s-idle auto-abandon timer so
// `me/current` doesn't keep re-hydrating a run the player walked away
// from. Backend treats already-ended runs as a no-op.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const id = String(req.query.id ?? "");
  if (!id) return res.status(400).json({ error: "id is required" });

  const upstream = await fetch(backendUrl(`/play/solo/runs/${encodeURIComponent(id)}/abandon`), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
  });
  copyBackendCookies(res, upstream);
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.send(text);
}
