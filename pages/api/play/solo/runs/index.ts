import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

// POST /api/play/solo/runs — start a new solo Endless run.
// Proxied straight through so cookies + CSRF survive. The backend
// closes any prior active run for this user before issuing the first
// round, so the client doesn't need to clean up on its side.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const upstream = await fetch(backendUrl("/play/solo/runs"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
  });
  copyBackendCookies(res, upstream);
  const body = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.send(body);
}
