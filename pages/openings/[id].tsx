import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useState, useCallback } from "react";
import Layout from "@/components/Layout";
import { getAdjacentOpenings, getMyRating, getOpening } from "@/lib/api";
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
  RateResponse,
  SortKey,
  User,
  UserRating,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const id = u.hostname.includes("youtu.be")
      ? u.pathname.slice(1)
      : u.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  user: User | null;
  modQueueCount: number;
  groups: Group[];
  opening: Opening | null;
  embedUrl: string | null;
  adjacent: AdjacentOpenings;
  userRating: UserRating | null;
  apiOnline: boolean;
}

// ---------------------------------------------------------------------------
// SSR
// ---------------------------------------------------------------------------

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const id = ctx.params?.id as string;

  // Context forwarded from the list page (e.g. ?sort=top&q=naruto)
  const sort = typeof ctx.query.sort === "string" ? (ctx.query.sort as SortKey) : undefined;
  const q = typeof ctx.query.q === "string" ? ctx.query.q : undefined;

  let opening: Opening | null = null;
  let adjacent: AdjacentOpenings = { prev: null, next: null };
  let userRating: UserRating | null = null;
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
  } catch {
    // API offline — fall back to fixtures
    apiOnline = false;
    opening = mockOpening(id);
    adjacent = mockAdjacentOpenings(id);
    if (session.user && opening) {
      userRating = mockUserRating(id);
    }
  }

  if (!opening) {
    return { notFound: true };
  }

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      groups: session.mockGroups ?? [],
      opening,
      embedUrl: youtubeEmbed(opening.youtube_url),
      adjacent,
      userRating,
      apiOnline,
    },
  };
};

// ---------------------------------------------------------------------------
// Rating widget (client-side interactive)
// ---------------------------------------------------------------------------

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

interface RatingWidgetProps {
  openingId: string;
  initialScore: number | null;
  initialAvg: number;
  initialCount: number;
  user: User | null;
  groups: Group[];
}

function RatingWidget({
  openingId,
  initialScore,
  initialAvg,
  initialCount,
  user,
  groups,
}: RatingWidgetProps) {
  const [score, setScore] = useState<number | null>(initialScore);
  const [hover, setHover] = useState<number | null>(null);
  const [avg, setAvg] = useState(initialAvg);
  const [count, setCount] = useState(initialCount);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedToGroup, setAddedToGroup] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);

  const handleRate = useCallback(
    async (s: number) => {
      if (!user || saving) return;
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opening_id: openingId, score: s }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data: RateResponse = await res.json();
        setScore(data.user_score);
        setAvg(data.avg_rating);
        setCount(data.rating_count);
      } catch {
        setError("Failed to save rating. Try again.");
      } finally {
        setSaving(false);
      }
    },
    [openingId, user, saving],
  );

  const handleAddToGroup = useCallback(
    async (groupId: string) => {
      if (!user || addingGroup) return;
      setAddingGroup(true);
      try {
        await fetch("/api/group-add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opening_id: openingId, group_id: groupId }),
        });
        setAddedToGroup(groupId);
      } finally {
        setAddingGroup(false);
      }
    },
    [openingId, user, addingGroup],
  );

  if (!user) {
    return (
      <div className="panel rate-panel">
        <div className="panel-head"><span>Rate this opening</span></div>
        <div className="rate-body">
          <p className="rate-hint">Log in to rate and add to your collections.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/login" className="btn ghost sm" style={{ flex: 1, justifyContent: "center" }}>
              Log in
            </Link>
            <Link href="/signup" className="btn primary sm" style={{ flex: 1, justifyContent: "center" }}>
              Sign up
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel rate-panel">
      <div className="panel-head">
        <span>Your rating</span>
        {score !== null && (
          <span style={{ color: "var(--accent)", fontFamily: "var(--sans)", fontWeight: 700 }}>
            {score}
            <em style={{ color: "var(--fg-4)", fontWeight: 400, fontSize: 10, fontFamily: "var(--mono)" }}>/10</em>
          </span>
        )}
      </div>
      <div className="rate-body">
        <div className="rate-stars">
          {SCORES.map((s) => {
            const active = hover !== null ? s <= hover : score !== null ? s <= score : false;
            return (
              <button
                key={s}
                className={`rate-dot${active ? " on" : ""}`}
                onMouseEnter={() => setHover(s)}
                onMouseLeave={() => setHover(null)}
                onClick={() => handleRate(s)}
                disabled={saving}
                aria-label={`Rate ${s} out of 10`}
              >
                {s}
              </button>
            );
          })}
        </div>

        <div className="rate-aggregate">
          <span className="rate-avg">{avg.toFixed(1)}</span>
          <span className="rate-denom">/10</span>
          <span className="rate-count">{count.toLocaleString()} ratings</span>
        </div>

        {error && <p className="rate-error">{error}</p>}

        {groups.length > 0 && (
          <div className="rate-groups">
            <p className="rate-hint">Add to group</p>
            <div className="rate-group-list">
              {groups.map((g) => (
                <button
                  key={g.id}
                  className={`rate-group-btn${addedToGroup === g.id ? " done" : ""}`}
                  onClick={() => handleAddToGroup(g.id)}
                  disabled={addingGroup || addedToGroup === g.id}
                >
                  {addedToGroup === g.id ? "✓ Added" : g.name}
                </button>
              ))}
            </div>
          </div>
        )}
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
// Page component
// ---------------------------------------------------------------------------

export default function OpeningDetail({
  user,
  modQueueCount,
  groups,
  opening,
  embedUrl,
  adjacent,
  userRating,
  apiOnline,
}: Props) {
  const op = opening!; // guaranteed non-null (notFound otherwise)

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${op.title} — Opening Wiki`}
      description={`${op.title} · ${op.anime.name} · ${op.singer.name}`}
    >
      <div className="wrap">
        {/* Breadcrumb + quick prev/next */}
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
          {/* ── Main column ───────────────────────────────────────────── */}
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
                  <Link href={`/anime/${op.anime.id}`} className="detail-link">
                    {op.anime.name}
                  </Link>
                  <span className="detail-sep"> · </span>
                  <Link href={`/singers/${op.singer.id}`} className="detail-link">
                    {op.singer.name}
                  </Link>
                </div>
              </div>
              <div className="detail-score">
                <div className="detail-score-n">
                  {op.avg_rating.toFixed(1)}<em>/10</em>
                </div>
                <div className="detail-score-ct">{op.rating_count.toLocaleString()} ratings</div>
              </div>
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
          </div>

          {/* ── Sidebar ───────────────────────────────────────────────── */}
          <aside className="side">
            <RatingWidget
              openingId={op.id}
              initialScore={userRating?.score ?? null}
              initialAvg={op.avg_rating}
              initialCount={op.rating_count}
              user={user}
              groups={groups}
            />
          </aside>
        </div>

        {/* Prev / Next full navigation bar */}
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
