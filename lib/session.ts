// SSR session helper.
//
// The Go API issues an HTTP-only session cookie. From getServerSideProps we
// don't see cookie values directly — we just forward req.headers.cookie back to
// the API on every call. This module wraps the boilerplate of "read cookie, ask
// /me, optionally fetch mod-queue count" so pages can stay terse.

import type { GetServerSidePropsContext } from "next";
import { getMe, getModerationQueueCount } from "./api";
import type { User } from "./types";

export interface SessionData {
  user: User | null;
  cookie?: string;
  modQueueCount: number;
}

export async function loadSession(ctx: GetServerSidePropsContext): Promise<SessionData> {
  const cookie = ctx.req.headers.cookie ?? undefined;
  const user = await getMe(cookie).catch(() => null);

  let modQueueCount = 0;
  if (user && (user.role === "moderator" || user.role === "admin")) {
    modQueueCount = await getModerationQueueCount(cookie)
      .then((r) => r.count)
      .catch(() => 0);
  }

  return { user, cookie, modQueueCount };
}

// Plain-object form safe to pass as page props (no Date/undefined surprises).
export function serializeSession(s: SessionData) {
  return {
    user: s.user,
    modQueueCount: s.modQueueCount,
  };
}
