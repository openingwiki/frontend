import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useMemo, useState } from "react";

import Layout from "@/components/Layout";
import { getMySubmissions } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { MySubmissionItem, MySubmissionsResponse, SubmissionStatus, User } from "@/lib/types";
import { youtubeThumbnail } from "@/lib/youtube";

interface Props {
  user: User;
  modQueueCount: number;
  initial: MySubmissionsResponse;
}

type StatusFilter = "all" | SubmissionStatus;
type TypeFilter = "all" | "opening" | "anime" | "singer";
type SortMode = "recent" | "oldest" | "status";

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "In queue",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_ORDER: Record<SubmissionStatus, number> = {
  pending: 0,
  rejected: 1,
  approved: 2,
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: "/login?next=/my-submissions", permanent: false } };
  }
  // Graceful fallback so a transient API error doesn't 500 the page.
  // Empty counts/items render the empty state.
  let initial: MySubmissionsResponse = {
    items: [],
    counts: { all: 0, pending: 0, approved: 0, rejected: 0 },
    type_counts: { all: 0, opening: 0, anime: 0, singer: 0 },
  };
  try {
    initial = await getMySubmissions(session.cookie);
  } catch {
    /* keep empty */
  }
  return {
    props: { user: session.user, modQueueCount: session.modQueueCount, initial },
  };
};

export default function MySubmissionsPage({ user, modQueueCount, initial }: Props) {
  const [status, setStatus] = useState<StatusFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortMode>("recent");

  const filtered = useMemo(() => {
    const base = initial.items.filter((it) => {
      if (status !== "all" && it.status !== status) return false;
      if (type !== "all" && it.type !== type) return false;
      return true;
    });
    if (sort === "recent") return base;
    if (sort === "oldest") return [...base].reverse();
    // by status: pending → rejected → approved (matches design)
    return [...base].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));
  }, [initial.items, status, type, sort]);

  const c = initial.counts;
  const tc = initial.type_counts;

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`Your submissions — Opening Wiki`}
      description="Your submissions and their review state."
    >
      <div className="wrap">
        <div className="ms-crumb">
          <Link href="/">← Back to catalogue</Link>
          <span className="sep">/</span>
          <span>@{user.display_name}</span>
          <span className="sep">/</span>
          <span>submissions</span>
        </div>

        <div className="ms-head">
          <div>
            <h1 className="ms-h1">Your <em>submissions</em>.</h1>
            <p className="ms-head-sub">
              {c.all} total · recently submitted entries and their review state
            </p>
          </div>
          <div className="ms-head-right">
            <Link href="/submit" className="btn primary">+ New submission</Link>
          </div>
        </div>

        <div className="ms-filter-bar">
          <div className="ms-sort">
            <span className="ms-fb-label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
              <option value="all">All ({c.all})</option>
              <option value="pending">In queue ({c.pending})</option>
              <option value="rejected">Rejected ({c.rejected})</option>
              <option value="approved">Approved ({c.approved})</option>
            </select>
          </div>
          <div className="ms-sort">
            <span className="ms-fb-label">Type</span>
            <select value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
              <option value="all">All ({tc.all})</option>
              <option value="opening">OP / ED / OST ({tc.opening})</option>
              <option value="anime">Anime ({tc.anime})</option>
              <option value="singer">Singers ({tc.singer})</option>
            </select>
          </div>
          <span className="ms-spacer" />
          <div className="ms-sort">
            <span className="ms-fb-label">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
              <option value="recent">Most recent</option>
              <option value="oldest">Oldest first</option>
              <option value="status">By status</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="ms-empty">
            <h3>Nothing here.</h3>
            <p>No submissions match this filter combination.</p>
            <Link href="/submit" className="btn primary">+ Submit something</Link>
          </div>
        ) : (
          <div className="ms-list">
            {filtered.map((it) => (
              <SubmissionRow key={`${it.type}:${it.id}`} item={it} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function SubmissionRow({ item }: { item: MySubmissionItem }) {
  const submittedLabel = formatRelativeDate(item.submitted_at, "Sent");
  const reviewedLabel = item.reviewed_at ? formatRelativeDate(item.reviewed_at) : null;

  return (
    <article className={`ms-sub ms-${item.status}`}>
      <div className="ms-sub-head">
        <div className="ms-thumb-wrap">
          <Thumb item={item} />
        </div>
        <div className="ms-meta-block">
          <div className="ms-meta-tags">{renderTypeTag(item)}</div>
          <h3 className="ms-sub-title">{primaryTitle(item)}</h3>
          <div className="ms-sub-sub">{renderSubMeta(item, submittedLabel)}</div>
        </div>
        <div>
          <StatusBadge status={item.status} />
        </div>
      </div>
      {item.status === "rejected" && (item.rejection_reason || reviewedLabel) && (
        <div className="ms-review-block">
          <div className="ms-review-head">
            <span className="ms-verdict">Needs fixes</span>
            {reviewedLabel && <><span className="sep">·</span><span className="when">{reviewedLabel}</span></>}
          </div>
          {item.rejection_reason && (
            <div className="ms-review-msg">{item.rejection_reason}</div>
          )}
          <div className="ms-review-actions">
            <Link href="/submit" className="btn primary sm">Edit &amp; resubmit</Link>
          </div>
        </div>
      )}
      {item.status === "pending" && (
        <div className="ms-pending-note">
          <span className="bar" />
          <em>In moderator queue.</em> Reviewed within 24h typical.
        </div>
      )}
    </article>
  );
}

function renderTypeTag(item: MySubmissionItem) {
  if (item.type === "opening") {
    const k = (item.kind ?? "opening").toString();
    const label = k === "opening" ? "OP" : k === "ending" ? "ED" : "OST";
    const klass = k === "opening" ? "op" : k === "ending" ? "ed" : "ost";
    return <span className={`ms-tag ${klass}`}>{label}</span>;
  }
  if (item.type === "anime") return <span className="ms-tag anime">Anime</span>;
  return <span className="ms-tag singer">Singer</span>;
}

function primaryTitle(item: MySubmissionItem): string {
  if (item.type === "opening") return item.title ?? "—";
  return item.name ?? "—";
}

function renderSubMeta(item: MySubmissionItem, when: string) {
  if (item.type === "opening") {
    return (
      <>
        <span className="attr">{item.anime?.name ?? item.anime_name ?? "—"}</span>
        <span className="sep">·</span>
        <span>{item.singer?.name ?? item.singer_name ?? "—"}</span>
        <span className="sep">·</span>
        <span>{when}</span>
      </>
    );
  }
  if (item.type === "anime") {
    const bits = [item.year, item.format, item.studio].filter(Boolean).join(" · ");
    return (
      <>
        {bits && <><span>{bits}</span><span className="sep">·</span></>}
        <span>{when}</span>
      </>
    );
  }
  return (
    <>
      <span>{item.singer_type ?? "—"}</span>
      <span className="sep">·</span>
      <span>{when}</span>
    </>
  );
}

function Thumb({ item }: { item: MySubmissionItem }) {
  if (item.type === "opening") {
    // Pull the preview straight from YouTube's CDN — no API key needed,
    // and the URL is already validated server-side, so a bad submission
    // can't render a broken image (youtubeThumbnail returns null).
    const preview = item.youtube_url ? youtubeThumbnail(item.youtube_url) : null;
    return (
      <div className="ms-thumb">
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" loading="lazy" />
        ) : (
          <div className="ms-yt" />
        )}
      </div>
    );
  }
  if (item.type === "anime") {
    return (
      <div className="ms-thumb ms-thumb-poster">
        {item.cover_image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.cover_image_url} alt="" />
        ) : <span className="ms-ph">2:3</span>}
      </div>
    );
  }
  return (
    <div className="ms-thumb ms-thumb-round">
      {item.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.cover_image_url} alt="" />
      ) : <span className="ms-ph">1:1</span>}
    </div>
  );
}

function StatusBadge({ status }: { status: SubmissionStatus }) {
  return (
    <span className={`ms-status ms-status-${status}`}>
      <span className="ms-sdot" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function formatRelativeDate(iso: string, prefix?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  let rel: string;
  if (days <= 0) {
    const hours = Math.max(1, Math.floor((Date.now() - d.getTime()) / 3_600_000));
    rel = `${hours}h ago`;
  } else if (days === 1) {
    rel = "1 day ago";
  } else {
    rel = `${days} days ago`;
  }
  const stamp = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return prefix ? `${prefix} ${stamp} · ${rel}` : `${stamp} · ${rel}`;
}
