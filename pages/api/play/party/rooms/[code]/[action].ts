import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

// POST /api/play/party/rooms/{code}/{action} — join, start, leave.
const ALLOWED = new Set(["join", "start", "leave"]);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const code = String(req.query.code ?? "");
  const action = String(req.query.action ?? "");
  if (!ALLOWED.has(action)) return res.status(404).json({ error: "unknown action" });
  const upstream = await fetch(
    backendUrl(`/play/party/rooms/${encodeURIComponent(code)}/${action}`),
    {
      method: "POST",
      headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
      body: req.body ? JSON.stringify(req.body) : undefined,
    },
  );
  copyBackendCookies(res, upstream);
  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.send(text);
}
