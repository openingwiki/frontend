import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email = typeof req.body?.email === "string" ? req.body.email : "";
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  const upstream = await fetch(backendUrl("/auth/request-password-reset"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ email }),
  });

  // Always return 202 — never reveal whether the email exists.
  return res.status(202).json({ ok: true });
}
