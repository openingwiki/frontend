import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, readBackendError } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const currentPassword = typeof req.body?.current_password === "string" ? req.body.current_password : "";
  const newPassword = typeof req.body?.new_password === "string" ? req.body.new_password : "";

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new passwords are required" });
  }

  const upstream = await fetch(backendUrl("/auth/change-password"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });

  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.status(upstream.status).json({ error: message });
  }

  return res.status(204).end();
}
