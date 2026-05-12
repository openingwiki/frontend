// safeRedirect coerces a user-supplied `next=` value into a same-origin path
// or returns "/" as a safe fallback.
//
// The naive `value.startsWith("/")` check accepts `//evil.com`, which browsers
// resolve as `https://evil.com` — an open redirect. We also reject
// `/\evil.com` (some browsers interpret backslash as a path separator) and
// anything that isn't a string.
//
// Rules: the value must be exactly "/", or begin with "/" followed by a
// character that is neither "/" nor "\". Everything else collapses to "/".
export function safeRedirect(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (value === "/") return "/";
  if (!/^\/[^/\\]/.test(value)) return "/";
  return value;
}
