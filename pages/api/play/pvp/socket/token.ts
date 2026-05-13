import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders } from "@/lib/api-proxy";

// POST /api/play/pvp/socket/token — mint a one-shot WS upgrade
// token. The WS itself opens against the absolute backend URL with
// the token on the query string — no Next proxy involved (the
// backend hits ingress directly).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const upstream = await fetch(backendUrl("/play/pvp/socket/token"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify(req.body ?? {}),
  });
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.send(text);
}
