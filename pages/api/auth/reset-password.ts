import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, readBackendError } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = typeof req.body?.token === "string" ? req.body.token : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!token || !password) {
    return res.status(400).json({ error: "Token and password are required" });
  }

  const upstream = await fetch(backendUrl("/auth/reset-password"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ token, password }),
  });

  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.status(upstream.status).json({ error: message });
  }

  return res.status(204).end();
}
