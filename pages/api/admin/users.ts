import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, readBackendError } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const page = typeof req.query.page === "string" ? req.query.page : "1";
  const url = `${backendUrl("/admin/users")}?q=${encodeURIComponent(q)}&page=${page}`;
  const upstream = await fetch(url, {
    headers: buildCsrfHeaders(req.headers.cookie),
  });
  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.status(upstream.status).json({ error: message });
  }
  const data = await upstream.json();
  return res.status(200).json(data);
}
