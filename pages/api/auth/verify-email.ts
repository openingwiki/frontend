import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies, readBackendError } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = typeof req.body?.token === "string" ? req.body.token : "";
  if (!token) {
    return res.status(400).json({ error: "Token is required" });
  }

  const upstream = await fetch(backendUrl("/auth/verify-email"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ token }),
  });

  copyBackendCookies(res, upstream);

  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.status(upstream.status).json({ error: message });
  }

  return res.status(200).json({ ok: true });
}
