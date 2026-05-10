import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useState } from "react";
import Layout from "@/components/Layout";
import LocalSortDropdown from "@/components/LocalSortDropdown";
import { getSinger } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { SingerDetail, SingerOpening, TrackKind, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  singer: SingerDetail;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const id = ctx.params?.id as string;
  try {
    const singer = await getSinger(id, session.cookie);
    return { props: { user: session.user, modQueueCount: session.modQueueCount, singer } };
  } catch {
    return { notFound: true };
  }
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function kindLabel(op: SingerOpening): string {
  const tag = op.kind === "opening" ? "OP" : op.kind === "ending" ? "ED" : "OST";
  return op.sequence_number != null ? `${tag} ${op.sequence_number}` : tag;
}

function kindClass(kind: TrackKind): string {
  if (kind === "opening") return "op";
  if (kind === "ending") return "ed";
  return "ost";
}

const TYPE_LABEL: Record<string, string> = {
  solo: "Solo artist",
  band: "Band",
  idol_group: "Idol group",
  vocaloid_producer: "Vocaloid / Producer",
  composer: "Composer",
  other: "Artist",
};

type SortKey = "sequence" | "top" | "newest";
type FilterTab = "all" | TrackKind;

const SORT_OPTIONS: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: "sequence", label: "Sequence",   hint: "OPs → EDs → OSTs by number" },
  { key: "top",      label: "Top rated",  hint: "Highest average score" },
  { key: "newest",   label: "Newest",     hint: "Recently approved first" },
];

const KIND_ORDER: Record<TrackKind, number> = { opening: 0, ending: 1, ost: 2 };

function sortOpenings(items: SingerOpening[], sort: SortKey): SingerOpening[] {
  return items.slice().sort((a, b) => {
    if (sort === "top") return b.avg_rating - a.avg_rating;
    if (sort === "newest") return (b.approved_at ?? "").localeCompare(a.approved_at ?? "");
    const ko = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (ko !== 0) return ko;
    return (a.sequence_number ?? 99) - (b.sequence_number ?? 99);
  });
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SingerPage({ user, modQueueCount, singer }: Props) {
  const [filter, setFilter] = useState<FilterTab>("all");
  const [sort, setSort] = useState<SortKey>("sequence");

  const ops  = singer.openings.filter((o) => o.kind === "opening");
  const eds  = singer.openings.filter((o) => o.kind === "ending");
  const osts = singer.openings.filter((o) => o.kind === "ost");

  const avgScore = singer.openings.length > 0
    ? (singer.openings.reduce((s, o) => s + o.avg_rating, 0) / singer.openings.length).toFixed(1)
    : null;

  const filtered = singer.openings.filter((o) => filter === "all" || o.kind === filter);
  const visible = sortOpenings(filtered, sort);

  const TABS: { key: FilterTab; label: string; count: number }[] = [
    { key: "all",     label: "All",      count: singer.openings.length },
    { key: "opening", label: "Openings", count: ops.length },
    { key: "ending",  label: "Endings",  count: eds.length },
    { key: "ost",     label: "OSTs",     count: osts.length },
  ];

  const typeLabel = TYPE_LABEL[singer.type] ?? "Artist";

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${singer.name} · Opening Wiki`}
      description={`All openings, endings, and OSTs by ${singer.name}`}
    >
      <div className="wrap">

        {/* Breadcrumb */}
        <div className="crumb">
          <Link href="/?kind=opening" className="crumb-link">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="12" height="12">
              <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
            </svg>
            All singers
          </Link>
        </div>

        {/* Hero */}
        <section className="singer-hero">
          <div className="singer-portrait">
            {singer.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={singer.cover_image_url} alt={singer.name} />
            ) : (
              <div className="singer-portrait-ph">
                <strong>portrait</strong>
                1:1 photo
              </div>
            )}
          </div>
          <div className="singer-hero-meta">
            <div className="singer-eyebrow">
              Singer
              <span className="singer-type-pill">{typeLabel}</span>
            </div>
            <h1 className="singer-title">{singer.name}</h1>
            {singer.name_native && (
              <div className="singer-native">{singer.name_native}</div>
            )}
            <div className="singer-stats">
              <div className="singer-stat">
                <span className="sst-lbl">Tracks</span>
                <span className="sst-val">{singer.openings.length}</span>
              </div>
              <div className="singer-stat">
                <span className="sst-lbl">Openings</span>
                <span className="sst-val">{ops.length}</span>
              </div>
              <div className="singer-stat">
                <span className="sst-lbl">Endings</span>
                <span className="sst-val">{eds.length}</span>
              </div>
              {avgScore && (
                <div className="singer-stat">
                  <span className="sst-lbl">Avg score</span>
                  <span className="sst-val">{avgScore}<em>/10</em></span>
                </div>
              )}
            </div>
            <div className="singer-actions">
              <Link href={`/submit?tab=opening`} className="btn primary">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14"/><path d="M5 12h14"/>
                </svg>
                Submit a track
              </Link>
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
            <span>tracks</span>
          </span>
          <span className="spacer" />
          <LocalSortDropdown
            options={SORT_OPTIONS}
            value={sort}
            onChange={setSort}
          />
        </div>

        {/* Track list */}
        {visible.length === 0 ? (
          <div className="empty-state">No entries yet.</div>
        ) : (
          <div className="singer-entries">
            {visible.map((op, i) => (
              <Link key={op.id} href={`/openings/${op.id}`} className="singer-entry">
                <div className={`singer-e-thumb p-${(i % 6) + 1}`}>
                  <div className="singer-e-play">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>
                <div className="singer-e-meta">
                  <div className="singer-e-row">
                    <span className={`e-tag ${kindClass(op.kind)}`}>{kindLabel(op)}</span>
                    <span className="singer-e-title">{op.title}</span>
                  </div>
                  <div className="singer-e-sub">
                    <Link
                      href={`/anime/${op.anime.id}`}
                      className="singer-e-anime"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {op.anime.name}
                    </Link>
                  </div>
                </div>
                {op.rating_count > 0 && (
                  <div className="singer-e-score">
                    <div className="n">{op.avg_rating.toFixed(1)}<em>/10</em></div>
                    <div className="ct">{op.rating_count}</div>
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}

      </div>
    </Layout>
  );
}
