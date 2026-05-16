import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import { formatSequenceLabel } from "@/lib/openings";
import { youtubeEmbedURL, youtubeThumbnail } from "@/lib/youtube";
import RatingPopup from "@/components/RatingPopup";
import CommentsSection from "@/components/CommentsSection";
import GroupAddMenu from "@/components/GroupAddMenu";
import {
  getAdjacentOpenings,
  getAnime,
  getMyGroup,
  getMyRating,
  getOpening,
  getSinger,
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
  AnimeOpening,
  Group,
  Opening,
  OpeningComment,
  SingerOpening,
  SortKey,
  TrackKind,
  User,
  UserRating,
} from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  groups: Group[];
  // IDs of the user's groups that already contain this opening — computed
  // server-side by fetching each /me/groups/{id} in parallel.
  initialMemberships: string[];
  opening: Opening | null;
  adjacent: AdjacentOpenings;
  userRating: UserRating | null;
  initialComments: OpeningComment[];
  commentsAvailable: boolean;
  apiOnline: boolean;
  animeOpenings: AnimeOpening[];
  animeName: string;
  animeId: string;
  singerOpenings: SingerOpening[];
  singerName: string;
  singerId: string;
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

  let animeOpenings: AnimeOpening[] = [];
  let animeName = "";
  let animeId = "";
  let singerOpenings: SingerOpening[] = [];
  let singerName = "";
  let singerId = "";

  try {
    [opening, adjacent] = await Promise.all([
      getOpening(id, session.cookie),
      getAdjacentOpenings(id, { sort, q }, session.cookie).catch(
        (): AdjacentOpenings => ({ prev: null, next: null }),
      ),
    ]);

    if (opening) {
      const [animeDetail, singerDetail] = await Promise.all([
        getAnime(opening.anime.id, session.cookie).catch(() => null),
        getSinger(opening.singer.id, session.cookie).catch(() => null),
      ]);
      if (animeDetail) {
        animeOpenings = animeDetail.openings;
        animeName = animeDetail.title_english ?? animeDetail.title_romaji ?? animeDetail.name;
        animeId = animeDetail.id;
      }
      if (singerDetail) {
        singerOpenings = singerDetail.openings;
        singerName = singerDetail.name;
        singerId = singerDetail.id;
      }
    }

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
      adjacent,
      userRating,
      initialComments,
      commentsAvailable,
      apiOnline,
      animeOpenings,
      animeName,
      animeId,
      singerOpenings,
      singerName,
      singerId,
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
// Helpers
// ---------------------------------------------------------------------------

function kindLabel(kind: TrackKind, seq: number | null): string {
  const tag = kind === "opening" ? "OP" : kind === "ending" ? "ED" : "OST";
  return seq != null ? `${tag} ${seq}` : tag;
}

function kindClass(kind: TrackKind): string {
  if (kind === "opening") return "op";
  if (kind === "ending") return "ed";
  return "ost";
}

// ---------------------------------------------------------------------------
// Rail widget
// ---------------------------------------------------------------------------

interface RailItem {
  id: string;
  title: string;
  youtube_url: string;
  kind: TrackKind;
  sequence_number: number | null;
  avg_rating: number;
  rating_count: number;
  subtitle: string;
}

function Rail({
  heading,
  items,
  currentId,
}: {
  heading: React.ReactNode;
  items: RailItem[];
  currentId: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rail-section">
      <div className="sec-head">
        <h2 className="sec-h2">{heading}</h2>
        <span className="sec-count">{items.length}</span>
      </div>
      <div className="rail">
        {items.map((item, i) => {
          const isCurrent = item.id === currentId;
          return (
            <Link
              key={item.id}
              href={`/openings/${item.id}`}
              className={`rail-card${isCurrent ? " current-card" : ""}`}
            >
              {(() => {
                const thumb = youtubeThumbnail(item.youtube_url);
                return (
                  <div className={`rail-thumb p-${(i % 6) + 1}${isCurrent ? " current" : ""}`}>
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="rail-thumb-img" />
                    )}
                    <span className={`rail-seq ${kindClass(item.kind)}${isCurrent ? " current" : ""}`}>
                      {kindLabel(item.kind, item.sequence_number)}
                    </span>
                    {isCurrent && <span className="rail-now">now playing</span>}
                    {!isCurrent && (
                      <span className="rail-play">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </span>
                    )}
                  </div>
                );
              })()}
              <div className="rail-meta">
                <div className="rail-title">{item.title}</div>
                <div className="rail-sub-row">
                  <span className="rail-sub">{item.subtitle}</span>
                  {item.rating_count > 0 && (
                    <span className="rail-rating">
                      {item.avg_rating.toFixed(1)}<em>/10</em>
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
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
  adjacent,
  userRating,
  initialComments,
  commentsAvailable,
  apiOnline,
  animeOpenings,
  animeName,
  animeId,
  singerOpenings,
  singerName,
  singerId,
}: Props) {
  const op = opening!;

  const animeRailItems = animeOpenings.map((ao) => ({
    id: ao.id,
    title: ao.title,
    youtube_url: ao.youtube_url,
    kind: ao.kind,
    sequence_number: ao.sequence_number,
    avg_rating: ao.avg_rating,
    rating_count: ao.rating_count,
    subtitle: ao.singer.name,
  }));

  const singerRailItems = singerOpenings.map((so) => ({
    id: so.id,
    title: so.title,
    youtube_url: so.youtube_url,
    kind: so.kind,
    sequence_number: so.sequence_number,
    avg_rating: so.avg_rating,
    rating_count: so.rating_count,
    subtitle: so.anime.name,
  }));

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${op.title} — Opening Wiki`}
      description={`${op.title} · ${op.anime.name} · ${op.singer.name}`}
    >
      <div className="wrap">
        <div className="detail-crumb">
          <Link href={`/?kind=${op.kind}`}>
            ← All {op.kind === "opening" ? "openings" : op.kind === "ending" ? "endings" : "OSTs"}
          </Link>
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
              {youtubeEmbedURL(op.youtube_url) ? (
                <iframe
                  src={youtubeEmbedURL(op.youtube_url)!}
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
                  <Link href={`/anime/${op.anime.id}`} className="detail-link">{op.anime.name}</Link>
                  {/* "Naruto · OP1 · Asian Kung-Fu Generation" — OST rows
                      have no sequence_number, so the prefix is skipped
                      and the row collapses to "Naruto · Yasha". */}
                  {formatSequenceLabel(op.kind, op.sequence_number) && (
                    <>
                      <span className="detail-sep"> · </span>
                      <span className="detail-seq">{formatSequenceLabel(op.kind, op.sequence_number)}</span>
                    </>
                  )}
                  <span className="detail-sep"> · </span>
                  <Link href={`/singers/${op.singer.id}`} className="detail-link">{op.singer.name}</Link>
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
              <span className="detail-attr">
                <span className="detail-attr-label">Type</span>
                <span className="detail-attr-val" style={{ textTransform: "capitalize" }}>
                  {op.kind === "ost" ? "OST" : op.kind}
                </span>
              </span>
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
              {/* Admin-only edit link */}
              {user?.role === "admin" && (
                <Link
                  href={`/openings/${op.id}/edit`}
                  className="detail-attr detail-attr-link"
                >
                  <span className="detail-attr-label">Admin</span>
                  <span className="detail-attr-val">✎ Edit opening</span>
                </Link>
              )}
            </div>

            <Rail
              heading={<>More from <Link href={`/anime/${animeId}`} className="sec-h2-link"><em>{animeName}</em></Link></>}
              items={animeRailItems}
              currentId={op.id}
            />

            <Rail
              heading={<>More from <Link href={`/singers/${singerId}`} className="sec-h2-link"><em>{singerName}</em></Link></>}
              items={singerRailItems}
              currentId={op.id}
            />

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
