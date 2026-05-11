import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Layout from "@/components/Layout";
import { listModerationQueue } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { ModerationItem, ModerationItemType, User } from "@/lib/types";
import { pushToast } from "@/lib/toast";
import { youtubeThumbnail } from "@/lib/youtube";

interface Props {
  user: User;
  modQueueCount: number;
  type: ModerationItemType;
  items: ModerationItem[];
  total: number;
  page: number;
  perPage: number;
  hasNext: boolean;
  apiOnline: boolean;
  flash: { kind: "info" | "error"; text: string } | null;
}

const TYPES: ModerationItemType[] = ["opening", "anime", "singer"];

const TYPE_LABEL: Record<ModerationItemType, string> = {
  opening: "Openings",
  anime: "Anime",
  singer: "Singers",
};

function pickType(value: unknown): ModerationItemType {
  return typeof value === "string" && (TYPES as string[]).includes(value)
    ? (value as ModerationItemType)
    : "opening";
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user || (session.user.role !== "moderator" && session.user.role !== "admin")) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const type = pickType(ctx.query.type);
  const page = Number(ctx.query.page ?? 1) || 1;

  let items: ModerationItem[] = [];
  let total = 0;
  let hasNext = false;
  let perPage = 20;
  let apiOnline = true;

  try {
    const res = await listModerationQueue({ type, page, cookie: session.cookie });
    items = res.items as ModerationItem[];
    total = res.total;
    perPage = res.per_page;
    hasNext = res.has_next;
  } catch {
    apiOnline = false;
  }

  const errorParam = typeof ctx.query.error === "string" ? ctx.query.error : null;
  const infoParam = typeof ctx.query.info === "string" ? ctx.query.info : null;
  const flash = errorParam
    ? { kind: "error" as const, text: errorParam }
    : infoParam
      ? { kind: "info" as const, text: infoParam }
      : null;

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      type,
      items,
      total,
      page,
      perPage,
      hasNext,
      apiOnline,
      flash,
    },
  };
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const KIND_BADGE: Record<string, string> = {
  opening: "OP",
  ending: "ED",
  ost: "OST",
};

const FORMAT_LABEL: Record<string, string> = {
  tv: "TV series",
  film: "Film",
  ova_ona: "OVA / ONA",
  special: "Special",
};

const SINGER_TYPE_LABEL: Record<string, string> = {
  solo: "Solo artist",
  band: "Band",
  idol_group: "Idol group",
  vocaloid_producer: "Vocaloid producer",
  composer: "Composer",
  other: "Other",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="mod-card-row">
      <span className="mod-card-row-k">{label}</span>
      <span className="mod-card-row-v">{value}</span>
    </div>
  );
}

function ItemCard({ item }: { item: ModerationItem }) {
  const isOpening = item.type === "opening";
  const isAnime = item.type === "anime";
  const isSinger = item.type === "singer";
  const thumb = isOpening && item.youtube_url
    ? youtubeThumbnail(item.youtube_url)
    : item.cover_image_url ?? null;
  const title = isOpening ? item.title : item.name;
  const thumbShape = isSinger ? "circle" : isAnime ? "poster" : "video";

  const animeName = item.anime?.name ?? item.anime_name;
  const animeId = item.anime?.id;
  const singerName = item.singer?.name ?? item.singer_name;
  const singerId = item.singer?.id;

  return (
    <li className="mod-card">
      {/* Left: visual — YouTube thumbnail for openings, cover for anime/singer. */}
      <div className={`mod-card-thumb mod-card-thumb-${thumbShape}`} aria-hidden>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" loading="lazy" />
        ) : (
          <span className="mod-card-thumb-fallback">
            {(title ?? item.type).slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className={`mod-card-pill mod-card-pill-${item.type}`}>
          {isOpening && item.kind ? KIND_BADGE[item.kind] ?? item.type : item.type}
        </span>
      </div>

      {/* Right: meta + actions */}
      <div className="mod-card-body">
        <div className="mod-card-head">
          <h3 className="mod-card-title">{title ?? "Untitled"}</h3>
          <span className="mod-card-when">{formatDate(item.submitted_at)}</span>
        </div>

        {isOpening && (
          <div className="mod-card-rows">
            <DetailRow
              label="Anime"
              value={animeId ? (
                <Link href={`/anime/${animeId}`} target="_blank" rel="noreferrer">{animeName ?? "—"}</Link>
              ) : (animeName ?? "—")}
            />
            <DetailRow
              label="Singer"
              value={singerId ? (
                <Link href={`/singers/${singerId}`} target="_blank" rel="noreferrer">{singerName ?? "—"}</Link>
              ) : (singerName ?? "—")}
            />
            <DetailRow label="Kind" value={(item.kind ?? "opening").toUpperCase()} />
            {item.sequence_number != null && (
              <DetailRow label="Sequence #" value={item.sequence_number} />
            )}
            {item.youtube_url && (
              <DetailRow
                label="YouTube"
                value={
                  <a href={item.youtube_url} target="_blank" rel="noopener noreferrer">
                    ↗ Open video
                  </a>
                }
              />
            )}
          </div>
        )}

        {isAnime && (
          <div className="mod-card-rows">
            {item.title_romaji && <DetailRow label="Romaji" value={item.title_romaji} />}
            {item.title_english && <DetailRow label="English" value={item.title_english} />}
            {item.title_native && <DetailRow label="Native" value={item.title_native} />}
            {item.year != null && <DetailRow label="Year" value={item.year} />}
            {item.format && (
              <DetailRow label="Format" value={FORMAT_LABEL[item.format] ?? item.format} />
            )}
            {item.episodes != null && <DetailRow label="Episodes" value={item.episodes} />}
            {item.studio && <DetailRow label="Studio" value={item.studio} />}
            {item.reference_url && (
              <DetailRow
                label="Reference"
                value={
                  <a href={item.reference_url} target="_blank" rel="noopener noreferrer">
                    ↗ {item.reference_url}
                  </a>
                }
              />
            )}
          </div>
        )}

        {isSinger && (
          <div className="mod-card-rows">
            {item.name_native && <DetailRow label="Native" value={item.name_native} />}
            {item.singer_type && (
              <DetailRow label="Type" value={SINGER_TYPE_LABEL[item.singer_type] ?? item.singer_type} />
            )}
            {item.active_since != null && (
              <DetailRow label="Active since" value={item.active_since} />
            )}
            {item.bio && <DetailRow label="Bio" value={<span className="mod-card-bio">{item.bio}</span>} />}
            {item.reference_url && (
              <DetailRow
                label="Reference"
                value={
                  <a href={item.reference_url} target="_blank" rel="noopener noreferrer">
                    ↗ {item.reference_url}
                  </a>
                }
              />
            )}
          </div>
        )}

        {item.notes_for_moderator && (
          <div className="mod-card-notes">
            <span className="mod-card-notes-k">Note to moderator</span>
            <p className="mod-card-notes-v">{item.notes_for_moderator}</p>
          </div>
        )}

        <p className="mod-card-by">
          {item.submitted_by ? (
            <>
              Submitted by <strong>{item.submitted_by.display_name}</strong>
            </>
          ) : (
            <em>Submitted by unknown user</em>
          )}
        </p>

        <div className="mod-card-actions">
          <form action="/api/mod/decide" method="post" className="mod-form">
            <input type="hidden" name="type" value={item.type} />
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="action" value="approve" />
            <button type="submit" className="btn primary sm">✓ Approve</button>
          </form>

          <form action="/api/mod/decide" method="post" className="mod-form mod-form-reject">
            <input type="hidden" name="type" value={item.type} />
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="action" value="reject" />
            <input
              type="text"
              name="reason"
              maxLength={200}
              placeholder="Reason (optional)"
              className="mod-reason"
            />
            <button type="submit" className="btn ghost sm mod-reject-btn">✕ Reject</button>
          </form>
        </div>
      </div>
    </li>
  );
}

export default function ModQueuePage({
  user,
  modQueueCount,
  type,
  items,
  total,
  page,
  hasNext,
  apiOnline,
  flash,
}: Props) {
  const router = useRouter();

  // Surface ?error= / ?info= as a toast, then strip from URL so refresh
  // doesn't re-fire it.
  useEffect(() => {
    if (!flash) return;
    pushToast({
      kind: flash.kind === "error" ? "error" : "success",
      message: flash.text,
    });
    const { error, info, ...rest } = router.query;
    void error;
    void info;
    router.replace({ pathname: router.pathname, query: rest }, undefined, {
      shallow: true,
      scroll: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Moderation queue">
      <div className="wrap" style={{ paddingTop: 32, paddingBottom: 64 }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            Moderation queue
          </h1>
          <p style={{ color: "var(--fg-3)", fontFamily: "var(--mono)", fontSize: 12, margin: 0 }}>
            {total.toLocaleString()} pending {TYPE_LABEL[type].toLowerCase()} ·{" "}
            {modQueueCount} total across all types
          </p>
        </header>

        <nav className="mod-tabs">
          {TYPES.map((t) => (
            <Link
              key={t}
              href={`/mod/queue?type=${t}`}
              className={`mod-tab${type === t ? " on" : ""}`}
            >
              {TYPE_LABEL[t]}
            </Link>
          ))}
        </nav>

        {!apiOnline ? (
          <p className="mock-notice">⚠ Go API unreachable — queue not loaded.</p>
        ) : items.length === 0 ? (
          <p className="entity-empty">
            Nothing waiting in the {TYPE_LABEL[type].toLowerCase()} queue.
          </p>
        ) : (
          <ul className="mod-list">
            {items.map((item) => (
              <ItemCard key={`${item.type}-${item.id}`} item={item} />
            ))}
          </ul>
        )}

        {(page > 1 || hasNext) && (
          <div className="mod-pagination">
            {page > 1 ? (
              <Link href={`/mod/queue?type=${type}&page=${page - 1}`} className="btn ghost sm">
                ← Prev
              </Link>
            ) : (
              <span />
            )}
            <span className="mod-page-label">Page {page}</span>
            {hasNext ? (
              <Link href={`/mod/queue?type=${type}&page=${page + 1}`} className="btn ghost sm">
                Next →
              </Link>
            ) : (
              <span />
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
