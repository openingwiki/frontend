import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders } from "@/lib/api-proxy";

// GET /api/play/pvp/matches/{code} — read the lobby view.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const code = String(req.query.code ?? "");
  const upstream = await fetch(backendUrl(`/play/pvp/matches/${encodeURIComponent(code)}`), {
    headers: buildCsrfHeaders(req.headers.cookie),
  });
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.send(text);
}
