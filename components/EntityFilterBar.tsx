import type { SortKey } from "@/lib/types";
import SortBar from "./SortBar";

interface Props {
  basePath: string;
  sort: SortKey;
  q: string;
  total: number;
  filteredTotal: number;
  searchPlaceholder?: string;
}

const SEARCH_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

// Compact filter row for anime/singer detail pages.
// Uses real <form method="GET"> so it works without JS — same SSR-first
// approach as SearchHeader. SortBar links carry the active `q` over.
export default function EntityFilterBar({
  basePath,
  sort,
  q,
  total,
  filteredTotal,
  searchPlaceholder,
}: Props) {
  const isFiltered = q.trim().length > 0 && filteredTotal !== total;

  return (
    <div className="entity-filter">
      <form className="entity-filter-search" action={basePath} method="get">
        {SEARCH_ICON}
        <input
          name="q"
          defaultValue={q}
          placeholder={searchPlaceholder ?? "Filter openings…"}
          aria-label="Filter openings"
        />
        {sort && sort !== "newest" && <input type="hidden" name="sort" value={sort} />}
        {q && (
          <a className="entity-filter-clear" href={basePath} aria-label="Clear filter">
            ×
          </a>
        )}
      </form>

      <SortBar
        total={isFiltered ? filteredTotal : total}
        sort={sort}
        basePath={basePath}
        q={q || undefined}
      />
    </div>
  );
}
