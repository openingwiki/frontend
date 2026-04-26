import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import RatingPopup from "@/components/RatingPopup";
import CommentsSection from "@/components/CommentsSection";
import GroupAddMenu from "@/components/GroupAddMenu";
import {
  getAdjacentOpenings,
  getMyGroup,
  getMyRating,
  getOpening,
  listMyGroups,
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

interface Props {
  user: User | null;
  modQueueCount: number;
  groups: Group[];
  // IDs of the user's groups that already contain this opening — computed
  // server-side by fetching each /me/groups/{id} in parallel.
  initialMemberships: string[];
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
  let groups: Group[] = [];
  const initialMemberships: string[] = [];
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
      // Fetch the user's actual groups so the "Save to groups" menu in the
      // sidebar shows real options. We also fetch each group's openings list
      // in parallel to compute which ones already contain this opening, so
      // the menu can render ✓ markers and toggle correctly.
      [userRating, groups] = await Promise.all([
        getMyRating(id, session.cookie).catch(() => null),
        session.mockGroups
          ? Promise.resolve(session.mockGroups)
          : listMyGroups(session.cookie).catch(() => [] as Group[]),
      ]);

      if (groups.length > 0) {
        const details = await Promise.all(
          groups.map((g) =>
            getMyGroup(g.id, session.cookie)
              .then((d) => ({ id: g.id, openings: d.openings }))
              .catch(() => ({ id: g.id, openings: [] as { id: string }[] })),
          ),
        );
        for (const d of details) {
          if (d.openings.some((op) => op.id === id)) {
            initialMemberships.push(d.id);
          }
        }
      }
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
    groups = session.mockGroups ?? [];
    commentsAvailable = false;
  }

  if (!opening) return { notFound: true };

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      groups,
      initialMemberships,
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
  initialMemberships,
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
            <GroupAddMenu
              user={user}
              groups={groups}
              openingId={op.id}
              initialMemberships={initialMemberships}
            />
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
