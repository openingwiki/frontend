// SSR session helper.
//
// The Go API issues an HTTP-only session cookie. From getServerSideProps we
// don't see cookie values directly — we just forward req.headers.cookie back to
// the API on every call. This module wraps the boilerplate of "read cookie, ask
// /me, optionally fetch mod-queue count" so pages can stay terse.
//
// Dev convenience:
//   MOCK_AUTH=true  — returns a fake logged-in user when the Go API is offline.
//                     Set in .env.local. Never enable in production.

import type { GetServerSidePropsContext } from "next";
import { getMe, getModerationQueueCount } from "./api";
import { mockGroups, mockMe } from "./mock";
import type { Group, User } from "./types";

export interface SessionData {
  user: User | null;
  cookie?: string;
  modQueueCount: number;
  mockGroups?: Group[];
}

export async function loadSession(ctx: GetServerSidePropsContext): Promise<SessionData> {
  const cookie = ctx.req.headers.cookie ?? undefined;
  let user = await getMe(cookie).catch(() => null);

  const isMockAuth =
    process.env.MOCK_AUTH === "true" && process.env.NODE_ENV !== "production";

  if (!user && isMockAuth) {
    user = mockMe();
  }

  let modQueueCount = 0;
  if (user && (user.role === "moderator" || user.role === "admin")) {
    modQueueCount = await getModerationQueueCount(cookie)
      .then((r) => r.count)
      .catch(() => 0);
  }

  return {
    user,
    cookie,
    modQueueCount,
    mockGroups: isMockAuth && user ? mockGroups() : undefined,
  };
}

export function serializeSession(s: SessionData) {
  return {
    user: s.user,
    modQueueCount: s.modQueueCount,
  };
}
