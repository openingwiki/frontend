import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const upstream = await fetch(backendUrl(`/singers/search?q=${encodeURIComponent(q)}`), {
    headers: req.headers.cookie ? { cookie: req.headers.cookie } : undefined,
  });
  const data = await upstream.json();
  return res.status(upstream.status).json(data);
}
