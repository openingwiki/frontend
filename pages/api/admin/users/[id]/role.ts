import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, readBackendError } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id } = req.query;
  if (!id || typeof id !== "string") {
    return res.status(400).json({ error: "id is required" });
  }
  const upstream = await fetch(backendUrl(`/admin/users/${id}/role`), {
    method: "PATCH",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify(req.body),
  });
  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.status(upstream.status).json({ error: message });
  }
  const data = await upstream.json();
  return res.status(200).json(data);
}
