import type { NextApiRequest, NextApiResponse } from "next";
import {
  backendUrl,
  buildCsrfHeaders,
  copyBackendCookies,
  readBackendError,
} from "@/lib/api-proxy";
import { safeRedirect } from "@/lib/redirect";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const displayName =
    typeof req.body?.display_name === "string" ? req.body.display_name : "";
  const next = safeRedirect(req.body?.next);

  const upstream = await fetch(backendUrl("/auth/signup"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      email,
      password,
      display_name: displayName,
    }),
  });

  copyBackendCookies(res, upstream);

  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.redirect(302, `/signup?error=${encodeURIComponent(message)}`);
  }

  // Append the verification-pending flag so the landing page shows the modal
  // explaining that a confirmation link was emailed. The banner persists via
  // user.email_verified === false; the modal is one-shot, dismissed by the
  // user removing the query param.
  const separator = next.includes("?") ? "&" : "?";
  return res.redirect(302, `${next}${separator}signup=pending`);
}
