import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import EntityFilterBar from "@/components/EntityFilterBar";
import { getSinger } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { SingerDetail, SingerOpening, SortKey, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  singer: SingerDetail | null;
  filteredOpenings: SingerOpening[];
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

function applyFilter(items: SingerOpening[], q: string): SingerOpening[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (op) =>
      op.title.toLowerCase().includes(needle) ||
      op.anime.name.toLowerCase().includes(needle),
  );
}

function applySort(items: SingerOpening[], sort: SortKey): SingerOpening[] {
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

  let singer: SingerDetail | null = null;
  let apiOnline = true;

  try {
    singer = await getSinger(id, session.cookie);
  } catch {
    apiOnline = false;
    singer = null;
  }

  if (!singer) {
    return { notFound: true };
  }

  const filteredOpenings = applySort(applyFilter(singer.openings, q), sort);

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      singer,
      filteredOpenings,
      totalOpenings: singer.openings.length,
      q,
      sort,
      apiOnline,
    },
  };
};

export default function SingerPage({
  user,
  modQueueCount,
  singer,
  filteredOpenings,
  totalOpenings,
  q,
  sort,
  apiOnline,
}: Props) {
  const s = singer!;
  const isFiltering = q.trim().length > 0;

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${s.name} — Opening Wiki`}
      description={`All openings performed by ${s.name}.`}
    >
      <div className="wrap">
        <div className="detail-crumb">
          <Link href="/">← All openings</Link>
        </div>

        <header className="entity-head">
          <div className="entity-cover" aria-hidden>
            {s.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.cover_image_url} alt="" />
            ) : (
              <span className="entity-cover-fallback">{s.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="entity-head-meta">
            <p className="entity-kind">Singer</p>
            <h1 className="entity-name">{s.name}</h1>
            <p className="entity-stat">
              {totalOpenings} opening{totalOpenings === 1 ? "" : "s"}
            </p>
          </div>
        </header>

        {totalOpenings > 0 && (
          <EntityFilterBar
            basePath={`/singers/${s.id}`}
            sort={sort}
            q={q}
            total={totalOpenings}
            filteredTotal={filteredOpenings.length}
            searchPlaceholder="Filter by opening or anime…"
          />
        )}

        {totalOpenings === 0 ? (
          <p className="entity-empty">No approved openings yet.</p>
        ) : filteredOpenings.length === 0 ? (
          <p className="entity-empty">
            No openings match “{q}”.{" "}
            <Link href={`/singers/${s.id}`}>Clear filter</Link>
          </p>
        ) : (
          <ul className="entity-op-list">
            {filteredOpenings.map((op) => (
              <li key={op.id} className="entity-op-row">
                <Link href={`/openings/${op.id}`} className="entity-op-title">
                  {op.title}
                </Link>
                <Link href={`/anime/${op.anime.id}`} className="entity-op-related">
                  {op.anime.name}
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
            <Link href={`/singers/${s.id}`}>Show all</Link>
          </p>
        )}

        {!apiOnline && <p className="mock-notice">⚠ Go API unreachable.</p>}
      </div>
    </Layout>
  );
}
