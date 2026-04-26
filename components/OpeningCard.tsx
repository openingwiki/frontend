import Link from "next/link";
import type { Opening } from "@/lib/types";
import { youtubeThumbnail } from "@/lib/youtube";

interface Props {
  op: Opening;
  // The "NEW · 2d" badge text. Pre-computed on the server so SSR is deterministic.
  newLabel?: string;
}

const PLAY_ICON = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5v14l11-7z" />
  </svg>
);

export default function OpeningCard({ op, newLabel }: Props) {
  const thumb = youtubeThumbnail(op.youtube_url);
  const pattern = op.pattern ?? 1;
  // Pattern stripes are the placeholder when we can't extract a YouTube ID.
  const thumbClass = thumb ? "op-thumb" : `op-thumb p-${pattern}`;

  return (
    <article className="op-card">
      <Link href={`/openings/${op.id}`} className={thumbClass}>
        {thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="op-thumb-img" loading="lazy" />
        )}
        {newLabel && <span className="op-badge new">NEW · {newLabel}</span>}
        {op.duration && <span className="op-duration">{op.duration}</span>}
        <span className="op-play">
          <div>{PLAY_ICON}</div>
        </span>
      </Link>

      <div className="op-info">
        <div className="op-main">
          <h3 className="op-title">
            <Link href={`/openings/${op.id}`}>{op.title}</Link>
          </h3>
          <div className="op-meta">
            <Link href={`/anime/${op.anime.id}`}>{op.anime.name}</Link>
            <span className="sep"> · </span>
            <Link href={`/singers/${op.singer.id}`}>{op.singer.name}</Link>
          </div>
        </div>
        <div className="op-score">
          <div className="n">
            {op.avg_rating.toFixed(1)}
            <em>/10</em>
          </div>
          <div className="ct">{op.rating_count.toLocaleString()}</div>
        </div>
      </div>
    </article>
  );
}
