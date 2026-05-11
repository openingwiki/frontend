import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useState } from "react";
import Layout from "@/components/Layout";
import LocalSortDropdown from "@/components/LocalSortDropdown";
import { getAnime } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { youtubeThumbnail } from "@/lib/youtube";
import type { AnimeDetail, AnimeOpening, TrackKind, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  anime: AnimeDetail;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const id = ctx.params?.id as string;

  try {
    const anime = await getAnime(id, session.cookie);
    return { props: { user: session.user, modQueueCount: session.modQueueCount, anime } };
  } catch {
    return { notFound: true };
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FORMAT_LABEL: Record<string, string> = {
  tv: "TV series",
  film: "Film",
  ova_ona: "OVA / ONA",
  special: "Special",
};

function kindLabel(op: AnimeOpening): string {
  const tag = op.kind === "opening" ? "OP" : op.kind === "ending" ? "ED" : "OST";
  return op.sequence_number != null ? `${tag} ${op.sequence_number}` : tag;
}

function kindClass(kind: TrackKind): string {
  if (kind === "opening") return "op";
  if (kind === "ending") return "ed";
  return "ost";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type FilterTab = "all" | TrackKind;

export default function AnimePage({ user, modQueueCount, anime }: Props) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<"sequence" | "top" | "newest">("top");

  const ops    = anime.openings.filter((o) => o.kind === "opening");
  const eds    = anime.openings.filter((o) => o.kind === "ending");
  const osts   = anime.openings.filter((o) => o.kind === "ost");
  const avgScore = anime.openings.length > 0
    ? (anime.openings.reduce((s, o) => s + o.avg_rating, 0) / anime.openings.length).toFixed(1)
    : "—";

  const visible = anime.openings.filter(
    (o) => filter === "all" || o.kind === filter,
  ).slice().sort((a, b) => {
    if (sort === "top") return b.avg_rating - a.avg_rating;
    if (sort === "newest") return (b.approved_at ?? "").localeCompare(a.approved_at ?? "");
    // sequence: OPs first, then EDs, then OSTs, then by sequence_number
    const kindOrder = { opening: 0, ending: 1, ost: 2 };
    const ko = kindOrder[a.kind] - kindOrder[b.kind];
    if (ko !== 0) return ko;
    return (a.sequence_number ?? 99) - (b.sequence_number ?? 99);
  });

  const displayName = anime.title_english ?? anime.title_romaji ?? anime.name;
  const nativeTitle = anime.title_native;
  const romajiTitle = anime.title_romaji !== displayName ? anime.title_romaji : null;

  const leadParts: string[] = [];
  if (anime.year) leadParts.push(String(anime.year));
  if (anime.format) leadParts.push(FORMAT_LABEL[anime.format] ?? anime.format);
  if (anime.episodes) leadParts.push(`${anime.episodes} episodes`);
  if (anime.studio) leadParts.push(anime.studio);

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",     label: "All",      count: anime.openings.length },
    { key: "opening", label: "Openings", count: ops.length },
    { key: "ending",  label: "Endings",  count: eds.length },
    { key: "ost",     label: "OSTs",     count: osts.length },
  ];

  const SORT_OPTIONS: { key: typeof sort; label: string; hint: string }[] = [
    { key: "sequence", label: "Sequence",  hint: "OPs → EDs → OSTs by number" },
    { key: "top",      label: "Top rated", hint: "Highest average score" },
    { key: "newest",   label: "Newest",    hint: "Recently approved first" },
  ];

  const filterLabel: Record<FilterTab, string> = {
    all: "entries", opening: "openings", ending: "endings", ost: "OSTs",
  };

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${displayName} · Opening Wiki`}
      description={`All openings, endings, and OSTs from ${displayName}`}
    >
      <div className="wrap">
        {/* Breadcrumb */}
        <div className="crumb">
          <Link href="/" className="crumb-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
              <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
            </svg>
            All anime
          </Link>
        </div>

        {/* Hero */}
        <section className="anime-hero">
          <div className="anime-cover">
            {anime.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={anime.cover_image_url} alt={displayName} />
            ) : (
              <div className="anime-cover-ph">
                <strong>cover art</strong>
                2:3 poster
              </div>
            )}
          </div>
          <div className="anime-hero-meta">
            <div className="anime-eyebrow">Anime</div>
            <h1 className="anime-title">{displayName}</h1>
            {nativeTitle && <div className="anime-native">{nativeTitle}</div>}
            {romajiTitle && <div className="anime-romaji">{romajiTitle}</div>}
            {leadParts.length > 0 && (
              <div className="anime-lead">
                {leadParts.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span className="anime-sep"> · </span>}
                    {p}
                  </span>
                ))}
              </div>
            )}
            <div className="anime-stats">
              <div className="anime-stat"><span className="ast-lbl">Openings</span><span className="ast-val">{ops.length}</span></div>
              <div className="anime-stat"><span className="ast-lbl">Endings</span><span className="ast-val">{eds.length}</span></div>
              <div className="anime-stat"><span className="ast-lbl">OSTs</span><span className="ast-val">{osts.length}</span></div>
              <div className="anime-stat"><span className="ast-lbl">Avg score</span><span className="ast-val">{avgScore}{anime.openings.length > 0 && <em>/10</em>}</span></div>
            </div>
            <div className="anime-actions">
              <Link href={`/submit?tab=opening&anime_id=${anime.id}`} className="btn primary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14"/><path d="M5 12h14"/>
                </svg>
                Submit an opening
              </Link>
              {anime.reference_url && anime.reference_url !== "about:blank" && (
                <a href={anime.reference_url} target="_blank" rel="noopener noreferrer" className="btn">
                  ↗ Reference
                </a>
              )}
            </div>
          </div>
        </section>

        {/* Type tabs */}
        <div className="type-tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={`type-tab${filter === tab.key ? " on" : ""}`}
              onClick={() => setFilter(tab.key)}
            >
              <span className="tt-label">
                {tab.label} <span className="tt-count">{tab.count}</span>
              </span>
            </button>
          ))}
        </div>

        {/* Sort bar */}
        <div className="sort-bar">
          <span>
            <span className="sort-count">{visible.length}</span>{" "}
            <span>{filterLabel[filter]}</span>
          </span>
          <span className="spacer" />
          <LocalSortDropdown
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
          />
        </div>

        {/* Grid */}
        {visible.length === 0 ? (
          <div className="empty-state">No entries yet.</div>
        ) : (
          <div className="cat">
            {visible.map((op, i) => {
              const thumb = youtubeThumbnail(op.youtube_url);
              return (
              <article key={op.id} className="op-card">
                <Link href={`/openings/${op.id}`} className={thumb ? "op-thumb" : `op-thumb p-${(i % 6) + 1}`}>
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="op-thumb-img" loading="lazy" />
                  )}
                  <span className={`op-seq ${kindClass(op.kind)}`}>{kindLabel(op)}</span>
                  <span className="op-play">
                    <div>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"/>
                      </svg>
                    </div>
                  </span>
                </Link>
                <div className="op-info">
                  <div className="op-main">
                    <h3 className="op-title">
                      <Link href={`/openings/${op.id}`}>{op.title}</Link>
                    </h3>
                    <div className="op-meta">
                      <Link href={`/singers/${op.singer.id}`} className="op-meta-link">{op.singer.name}</Link>
                    </div>
                  </div>
                  {op.rating_count > 0 && (
                    <div className="op-score">
                      <div className="n">{op.avg_rating.toFixed(1)}<em>/10</em></div>
                      <div className="ct">{op.rating_count}</div>
                    </div>
                  )}
                </div>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
