import Link from "next/link";
import type { SortKey } from "@/lib/types";

interface Props {
  total: number;
  sort: SortKey;
  basePath: string;
  q?: string;
}

const OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "newest",     label: "Newest" },
  { key: "top",        label: "Top rated" },
  { key: "most_rated", label: "Most rated" },
];

function buildHref(base: string, q: string | undefined, key: SortKey) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  params.set("sort", key);
  return `${base}?${params.toString()}`;
}

// SSR-friendly sort: each button is a real <Link> that re-renders the page
// with a new ?sort= query. No client state needed — the active state comes
// straight from the URL.
export default function SortBar({ total, sort, basePath, q }: Props) {
  return (
    <div className="sort-bar">
      <span>
        <span className="count">{total.toLocaleString()}</span> openings
      </span>
      <span className="spacer" />
      <div className="sort">
        <span>Sort</span>
        {OPTIONS.map((o) => (
          <Link
            key={o.key}
            href={buildHref(basePath, q, o.key)}
            className={`sort-btn${sort === o.key ? " on" : ""}`}
            scroll={false}
          >
            {o.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
