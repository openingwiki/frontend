import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies, readBackendError } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const upstream = await fetch(backendUrl("/auth/resend-verification"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie),
  });

  copyBackendCookies(res, upstream);

  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.status(upstream.status).json({ error: message });
  }

  return res.status(202).json({ ok: true });
}
