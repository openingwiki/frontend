import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders } from "@/lib/api-proxy";

// /api/play/solo/me/current — resume-on-reload for the run page.
// Backend returns 204 No Content when the caller has no active run.
// Forward that status as-is so the client can branch on it without
// parsing a body.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const upstream = await fetch(backendUrl("/play/solo/me/current"), {
    headers: buildCsrfHeaders(req.headers.cookie),
  });
  res.status(upstream.status);
  const ct = upstream.headers.get("content-type");
  if (ct) res.setHeader("content-type", ct);
  if (upstream.status === 204) {
    res.end();
    return;
  }
  const body = await upstream.text();
  res.send(body);
}
