import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const upstream = await fetch(backendUrl("/play/solo/me/stats"), {
    headers: buildCsrfHeaders(req.headers.cookie),
  });
  const body = await upstream.text();
  res.status(upstream.status);
  res.setHeader("content-type", upstream.headers.get("content-type") ?? "application/json");
  res.send(body);
}
