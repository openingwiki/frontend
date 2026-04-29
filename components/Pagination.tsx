import Link from "next/link";

interface Props {
  page: number;
  totalPages: number;
  basePath: string;
  query?: Record<string, string | undefined>;
}

function href(basePath: string, query: Props["query"], page: number) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

function buildPages(page: number, totalPages: number): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) {
    pages.add(2);
    pages.add(3);
    pages.add(4);
  }
  if (page >= totalPages - 2) {
    pages.add(totalPages - 1);
    pages.add(totalPages - 2);
    pages.add(totalPages - 3);
  }

  const ordered = Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  const items: Array<number | "ellipsis"> = [];
  for (const current of ordered) {
    const previous = items[items.length - 1];
    if (typeof previous === "number" && current - previous > 1) {
      items.push("ellipsis");
    }
    items.push(current);
  }

  return items;
}

export default function Pagination({ page, totalPages, basePath, query }: Props) {
  if (totalPages <= 1) return null;

  const items = buildPages(page, totalPages);

  return (
    <nav className="pag" aria-label="Pagination">
      {page > 1 ? (
        <Link href={href(basePath, query, page - 1)} aria-label="Previous">
          {"<"}
        </Link>
      ) : (
        <button aria-label="Previous" disabled>
          {"<"}
        </button>
      )}

      {items.map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="info">
            ...
          </span>
        ) : (
          <Link
            key={item}
            href={href(basePath, query, item)}
            className={item === page ? "on" : undefined}
          >
            {item}
          </Link>
        ),
      )}

      {page < totalPages ? (
        <Link href={href(basePath, query, page + 1)} aria-label="Next">
          {">"}
        </Link>
      ) : (
        <button aria-label="Next" disabled>
          {">"}
        </button>
      )}
    </nav>
  );
}
