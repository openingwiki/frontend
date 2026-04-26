import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Pages allowed while the user still needs to confirm their email. Anything
// outside this allowlist is redirected to /verify-email so the gate cannot
// be skipped by typing the URL manually.
const ALLOWED_PREFIXES = [
  "/verify-email",
  "/login",
  "/signup",
  "/api/", // signup, login, verify-email, resend-verification proxies
  "/_next/",
  "/favicon",
  "/robots.txt",
];

const NEEDS_VERIFY_COOKIE = "ow_needs_verify";

export function middleware(req: NextRequest) {
  const needsVerify = req.cookies.get(NEEDS_VERIFY_COOKIE)?.value === "1";
  if (!needsVerify) return NextResponse.next();

  const path = req.nextUrl.pathname;
  if (ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/verify-email";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Skip the middleware entirely for static assets to keep navigation snappy.
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
