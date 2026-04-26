import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect } from "react";
import Layout from "@/components/Layout";
import { listModerationQueue } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { ModerationItem, ModerationItemType, User } from "@/lib/types";
import { pushToast } from "@/lib/toast";

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

function ItemCard({ item }: { item: ModerationItem }) {
  return (
    <li className="mod-item">
      <div className="mod-item-head">
        <span className="mod-item-type">{item.type}</span>
        <span className="mod-item-date">{formatDate(item.submitted_at)}</span>
      </div>

      {item.type === "opening" ? (
        <>
          <h3 className="mod-item-title">{item.title}</h3>
          <p className="mod-item-meta">
            {item.anime_name} · {item.singer_name}
          </p>
          {item.youtube_url && (
            <a
              className="mod-item-link"
              href={item.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              ↗ Open on YouTube
            </a>
          )}
        </>
      ) : (
        <h3 className="mod-item-title">{item.name}</h3>
      )}

      <p className="mod-item-by">
        {item.submitted_by ? (
          <>
            Submitted by <strong>{item.submitted_by.display_name}</strong>
          </>
        ) : (
          <em>Submitted by unknown user</em>
        )}
      </p>

      <div className="mod-item-actions">
        <form action="/api/mod/decide" method="post" className="mod-form">
          <input type="hidden" name="type" value={item.type} />
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="action" value="approve" />
          <button type="submit" className="btn primary sm">Approve</button>
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
          <button type="submit" className="btn ghost sm mod-reject-btn">Reject</button>
        </form>
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
