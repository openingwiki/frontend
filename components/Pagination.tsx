import Link from "next/link";

interface Props {
  page: number;
  totalPages: number;
  basePath: string;
  // Extra query params to preserve across pages.
  query?: Record<string, string | undefined>;
}

function href(basePath: string, query: Props["query"], page: number) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([k, v]) => {
    if (v) params.set(k, v);
  });
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

// Mimics the design's compact "‹ 1 2 3 … 269 ›" pagination. Always shows the
// first 3 pages, an ellipsis, and the last page when totalPages > 4.
export default function Pagination({ page, totalPages, basePath, query }: Props) {
  if (totalPages <= 1) return null;

  const showHead = [1, 2, 3].filter((p) => p <= totalPages);
  const showTail = totalPages > 3 ? totalPages : null;

  return (
    <nav className="pag" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(basePath, query, page - 1)} aria-label="Previous">‹</Link>
      ) : (
        <button aria-label="Previous" disabled>‹</button>
      )}

      {showHead.map((p) => (
        <Link
          key={p}
          href={href(basePath, query, p)}
          className={p === page ? "on" : undefined}
        >
          {p}
        </Link>
      ))}

      {showTail && showTail > 3 && <span className="info">…</span>}
      {showTail && showTail > 3 && (
        <Link
          href={href(basePath, query, showTail)}
          className={page === showTail ? "on" : undefined}
        >
          {showTail}
        </Link>
      )}

      {page < totalPages ? (
        <Link href={href(basePath, query, page + 1)} aria-label="Next">›</Link>
      ) : (
        <button aria-label="Next" disabled>›</button>
      )}
    </nav>
  );
}
