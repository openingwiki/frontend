import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

// GET /api/play/solo/runs/{id} — fetch a run + its currently-pending
// round for crash recovery. The frontend calls this on mount of the
// run page when it has a run_id in the URL but no in-memory state.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const id = String(req.query.id ?? "");
  if (!id) return res.status(400).json({ error: "id is required" });

  const upstream = await fetch(backendUrl(`/play/solo/runs/${encodeURIComponent(id)}`), {
    headers: buildCsrfHeaders(req.headers.cookie),
  });
  copyBackendCookies(res, upstream);
  const body = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.send(body);
}
