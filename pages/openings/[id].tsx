import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useCallback, useState } from "react";
import Layout from "@/components/Layout";
import RatingPopup from "@/components/RatingPopup";
import CommentsSection from "@/components/CommentsSection";
import {
  getAdjacentOpenings,
  getMyRating,
  getOpening,
  listOpeningComments,
} from "@/lib/api";
import { loadSession } from "@/lib/session";
import {
  mockAdjacentOpenings,
  mockOpening,
  mockUserRating,
} from "@/lib/mock";
import type {
  AdjacentOpenings,
  Group,
  Opening,
  OpeningComment,
  SortKey,
  User,
  UserRating,
} from "@/lib/types";
import { youtubeEmbedURL } from "@/lib/youtube";
import { pushToast } from "@/lib/toast";

interface Props {
  user: User | null;
  modQueueCount: number;
  groups: Group[];
  opening: Opening | null;
  embedUrl: string | null;
  adjacent: AdjacentOpenings;
  userRating: UserRating | null;
  initialComments: OpeningComment[];
  commentsAvailable: boolean;
  apiOnline: boolean;
}

// ---------------------------------------------------------------------------
// SSR
// ---------------------------------------------------------------------------

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const id = ctx.params?.id as string;

  const sort = typeof ctx.query.sort === "string" ? (ctx.query.sort as SortKey) : undefined;
  const q = typeof ctx.query.q === "string" ? ctx.query.q : undefined;

  let opening: Opening | null = null;
  let adjacent: AdjacentOpenings = { prev: null, next: null };
  let userRating: UserRating | null = null;
  let initialComments: OpeningComment[] = [];
  let commentsAvailable = true;
  let apiOnline = true;

  try {
    [opening, adjacent] = await Promise.all([
      getOpening(id, session.cookie),
      getAdjacentOpenings(id, { sort, q }, session.cookie).catch(
        (): AdjacentOpenings => ({ prev: null, next: null }),
      ),
    ]);

    if (session.user && opening) {
      userRating = await getMyRating(id, session.cookie).catch(() => null);
    }

    // Comments are optional — backend endpoint may not be wired yet. We
    // detect that here so the section can show "coming soon" instead of
    // exploding the page render.
    if (opening) {
      try {
        const res = await listOpeningComments({ openingId: id, cookie: session.cookie });
        initialComments = res.items;
      } catch {
        commentsAvailable = false;
      }
    }
  } catch {
    apiOnline = false;
    opening = mockOpening(id);
    adjacent = mockAdjacentOpenings(id);
    if (session.user && opening) userRating = mockUserRating(id);
    commentsAvailable = false;
  }

  if (!opening) return { notFound: true };

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      groups: session.mockGroups ?? [],
      opening,
      embedUrl: youtubeEmbedURL(opening.youtube_url),
      adjacent,
      userRating,
      initialComments,
      commentsAvailable,
      apiOnline,
    },
  };
};

// ---------------------------------------------------------------------------
// "Add to group" sidebar — the rating itself moved into the popup, but the
// group-add affordance still belongs in the sidebar.
// ---------------------------------------------------------------------------

function AddToGroupCard({
  user,
  groups,
  openingId,
}: {
  user: User | null;
  groups: Group[];
  openingId: string;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const handleAdd = useCallback(
    async (groupId: string) => {
      if (!user || pendingId) return;
      setPendingId(groupId);
      try {
        const res = await fetch("/api/group-add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opening_id: openingId, group_id: groupId }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Add failed (${res.status})`);
        }
        setDone((prev) => new Set(prev).add(groupId));
        pushToast({ kind: "success", message: "Added to group" });
      } catch (err) {
        pushToast({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not add to group",
        });
      } finally {
        setPendingId(null);
      }
    },
    [openingId, user, pendingId],
  );

  if (!user) {
    return (
      <div className="panel rate-panel">
        <div className="panel-head"><span>Save to a group</span></div>
        <div className="rate-body">
          <p className="rate-hint">Log in to add this opening to your collections.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/login" className="btn ghost sm" style={{ flex: 1, justifyContent: "center" }}>Log in</Link>
            <Link href="/signup" className="btn primary sm" style={{ flex: 1, justifyContent: "center" }}>Sign up</Link>
          </div>
        </div>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="panel rate-panel">
        <div className="panel-head"><span>Your groups</span></div>
        <div className="rate-body">
          <p className="rate-hint">No groups yet.</p>
          <Link href="/groups?new=1" className="btn primary sm" style={{ width: "100%", justifyContent: "center" }}>
            Create one
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="panel rate-panel">
      <div className="panel-head"><span>Add to group</span></div>
      <div className="rate-body">
        <div className="rate-group-list">
          {groups.map((g) => {
            const isDone = done.has(g.id);
            return (
              <button
                key={g.id}
                className={`rate-group-btn${isDone ? " done" : ""}`}
                onClick={() => handleAdd(g.id)}
                disabled={pendingId !== null || isDone}
              >
                {isDone ? "✓ Added" : g.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prev / Next navigation bar
// ---------------------------------------------------------------------------

const PREV_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M15 18l-6-6 6-6" />
  </svg>
);
const NEXT_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

function OpeningNav({ adjacent }: { adjacent: AdjacentOpenings }) {
  if (!adjacent.prev && !adjacent.next) return null;
  return (
    <nav className="op-nav">
      {adjacent.prev ? (
        <Link href={`/openings/${adjacent.prev.id}`} className="op-nav-btn prev">
          {PREV_ICON}
          <span className="op-nav-content">
            <span className="op-nav-label">Previous</span>
            <span className="op-nav-title">{adjacent.prev.title}</span>
            <span className="op-nav-anime">{adjacent.prev.anime.name}</span>
          </span>
        </Link>
      ) : (
        <div />
      )}
      {adjacent.next ? (
        <Link href={`/openings/${adjacent.next.id}`} className="op-nav-btn next">
          <span className="op-nav-content right">
            <span className="op-nav-label">Next</span>
            <span className="op-nav-title">{adjacent.next.title}</span>
            <span className="op-nav-anime">{adjacent.next.anime.name}</span>
          </span>
          {NEXT_ICON}
        </Link>
      ) : (
        <div />
      )}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function OpeningDetail({
  user,
  modQueueCount,
  groups,
  opening,
  embedUrl,
  adjacent,
  userRating,
  initialComments,
  commentsAvailable,
  apiOnline,
}: Props) {
  const op = opening!;

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${op.title} — Opening Wiki`}
      description={`${op.title} · ${op.anime.name} · ${op.singer.name}`}
    >
      <div className="wrap">
        <div className="detail-crumb">
          <Link href="/">← All openings</Link>
          <span style={{ flex: 1 }} />
          {adjacent.prev && (
            <Link href={`/openings/${adjacent.prev.id}`} className="detail-crumb-adj">
              {PREV_ICON} Prev
            </Link>
          )}
          {adjacent.next && (
            <Link href={`/openings/${adjacent.next.id}`} className="detail-crumb-adj">
              Next {NEXT_ICON}
            </Link>
          )}
        </div>

        <div className="detail-grid">
          <div>
            <div className="detail-video">
              {embedUrl ? (
                <iframe
                  src={embedUrl}
                  title={op.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              ) : (
                <div className="detail-no-video">Video unavailable</div>
              )}
            </div>

            <div className="detail-meta-row">
              <div style={{ minWidth: 0, flex: 1 }}>
                <h1 className="detail-title">{op.title}</h1>
                <div className="detail-sub">
                  <span className="detail-link">{op.anime.name}</span>
                  <span className="detail-sep"> · </span>
                  <span className="detail-link">{op.singer.name}</span>
                </div>
              </div>
              {/* Rating popup is anchored here — its trigger lives where the
                  flat score number used to be. */}
              <RatingPopup
                openingId={op.id}
                user={user}
                initialAvg={op.avg_rating}
                initialCount={op.rating_count}
                initialUserScore={userRating?.score ?? null}
              />
            </div>

            <div className="detail-attrs">
              {op.duration && (
                <span className="detail-attr">
                  <span className="detail-attr-label">Duration</span>
                  <span className="detail-attr-val">{op.duration}</span>
                </span>
              )}
              <span className="detail-attr">
                <span className="detail-attr-label">Added</span>
                <span className="detail-attr-val">
                  {new Date(op.submitted_at).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </span>
              <a
                href={op.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="detail-attr detail-attr-link"
              >
                <span className="detail-attr-label">YouTube</span>
                <span className="detail-attr-val">↗ Watch on YouTube</span>
              </a>
            </div>

            <CommentsSection
              openingId={op.id}
              user={user}
              initialComments={initialComments}
              available={commentsAvailable}
            />
          </div>

          <aside className="side">
            <AddToGroupCard user={user} groups={groups} openingId={op.id} />
          </aside>
        </div>

        <OpeningNav adjacent={adjacent} />

        {!apiOnline && (
          <p className="mock-notice">
            ⚠ Go API unreachable — showing fixture data.
          </p>
        )}
      </div>
    </Layout>
  );
}
