import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import EntityFilterBar from "@/components/EntityFilterBar";
import { getAnime } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { AnimeDetail, AnimeOpening, SortKey, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  anime: AnimeDetail | null;
  filteredOpenings: AnimeOpening[];
  totalOpenings: number;
  q: string;
  sort: SortKey;
  apiOnline: boolean;
}

const VALID_SORTS: SortKey[] = ["newest", "top", "most_rated"];

function pickSort(value: unknown): SortKey {
  return typeof value === "string" && (VALID_SORTS as string[]).includes(value)
    ? (value as SortKey)
    : "newest";
}

function applyFilter(items: AnimeOpening[], q: string): AnimeOpening[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (op) =>
      op.title.toLowerCase().includes(needle) ||
      op.singer.name.toLowerCase().includes(needle),
  );
}

function applySort(items: AnimeOpening[], sort: SortKey): AnimeOpening[] {
  const copy = [...items];
  switch (sort) {
    case "top":
      copy.sort((a, b) => b.avg_rating - a.avg_rating || b.rating_count - a.rating_count);
      break;
    case "most_rated":
      copy.sort((a, b) => b.rating_count - a.rating_count || b.avg_rating - a.avg_rating);
      break;
    case "newest":
    default:
      copy.sort((a, b) => {
        const aTime = a.approved_at ? Date.parse(a.approved_at) : 0;
        const bTime = b.approved_at ? Date.parse(b.approved_at) : 0;
        return bTime - aTime;
      });
      break;
  }
  return copy;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const id = ctx.params?.id as string;

  const q = typeof ctx.query.q === "string" ? ctx.query.q.trim() : "";
  const sort = pickSort(ctx.query.sort);

  let anime: AnimeDetail | null = null;
  let apiOnline = true;

  try {
    anime = await getAnime(id, session.cookie);
  } catch {
    apiOnline = false;
    anime = null;
  }

  if (!anime) {
    return { notFound: true };
  }

  // The backend returns the full openings list — we sort/filter on SSR
  // (per-anime list is small enough that another round-trip isn't worth it).
  const filteredOpenings = applySort(applyFilter(anime.openings, q), sort);

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      anime,
      filteredOpenings,
      totalOpenings: anime.openings.length,
      q,
      sort,
      apiOnline,
    },
  };
};

export default function AnimePage({
  user,
  modQueueCount,
  anime,
  filteredOpenings,
  totalOpenings,
  q,
  sort,
  apiOnline,
}: Props) {
  const a = anime!;
  const isFiltering = q.trim().length > 0;

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${a.name} — Opening Wiki`}
      description={`All openings from ${a.name}.`}
    >
      <div className="wrap">
        <div className="detail-crumb">
          <Link href="/">← All openings</Link>
        </div>

        <header className="entity-head">
          <div className="entity-cover" aria-hidden>
            {a.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.cover_image_url} alt="" />
            ) : (
              <span className="entity-cover-fallback">{a.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="entity-head-meta">
            <p className="entity-kind">Anime</p>
            <h1 className="entity-name">{a.name}</h1>
            <p className="entity-stat">
              {totalOpenings} opening{totalOpenings === 1 ? "" : "s"}
            </p>
          </div>
        </header>

        {totalOpenings > 0 && (
          <EntityFilterBar
            basePath={`/anime/${a.id}`}
            sort={sort}
            q={q}
            total={totalOpenings}
            filteredTotal={filteredOpenings.length}
            searchPlaceholder="Filter by opening or singer…"
          />
        )}

        {totalOpenings === 0 ? (
          <p className="entity-empty">No approved openings yet.</p>
        ) : filteredOpenings.length === 0 ? (
          <p className="entity-empty">
            No openings match “{q}”.{" "}
            <Link href={`/anime/${a.id}`}>Clear filter</Link>
          </p>
        ) : (
          <ul className="entity-op-list">
            {filteredOpenings.map((op) => (
              <li key={op.id} className="entity-op-row">
                <Link href={`/openings/${op.id}`} className="entity-op-title">
                  {op.title}
                </Link>
                <Link href={`/singers/${op.singer.id}`} className="entity-op-related">
                  {op.singer.name}
                </Link>
                <div className="entity-op-score">
                  <span className="entity-op-score-n">{op.avg_rating.toFixed(1)}</span>
                  <span className="entity-op-score-d">/10</span>
                  <span className="entity-op-score-c">{op.rating_count.toLocaleString()}</span>
                </div>
                <a
                  href={op.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="entity-op-yt"
                  aria-label="Open on YouTube"
                >
                  ↗
                </a>
              </li>
            ))}
          </ul>
        )}

        {isFiltering && filteredOpenings.length > 0 && (
          <p className="entity-filter-hint">
            Showing {filteredOpenings.length} of {totalOpenings} openings.{" "}
            <Link href={`/anime/${a.id}`}>Show all</Link>
          </p>
        )}

        {!apiOnline && <p className="mock-notice">⚠ Go API unreachable.</p>}
      </div>
    </Layout>
  );
}
