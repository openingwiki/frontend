import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

// POST /api/play/solo/runs/{id}/answer — submit the round answer.
// anime_id may be null for "no guess / timeout"; round_token is
// required and the backend rejects mismatches with 401. Scoring is
// anime-based: any opening of the right anime counts.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const id = String(req.query.id ?? "");
  if (!id) return res.status(400).json({ error: "id is required" });

  const body = req.body ?? {};
  const upstream = await fetch(backendUrl(`/play/solo/runs/${encodeURIComponent(id)}/answer`), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      round_token: body.round_token ?? "",
      anime_id: body.anime_id ?? null,
      client_response_ms: Number(body.client_response_ms ?? 0) | 0,
    }),
  });
  copyBackendCookies(res, upstream);
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.send(text);
}
