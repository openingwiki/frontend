import Link from "next/link";
import type { SearchEntityHit } from "@/lib/types";

interface Props {
  q: string;
  anime: SearchEntityHit[];
  singers: SearchEntityHit[];
}

function Column({
  title,
  basePath,
  items,
}: {
  title: string;
  basePath: "/anime" | "/singers";
  items: SearchEntityHit[];
}) {
  return (
    <section className="search-col">
      <header className="search-col-head">
        <span>{title}</span>
        <span className="count">{items.length}</span>
      </header>
      {items.length === 0 ? (
        <p className="search-empty">No matches.</p>
      ) : (
        <div className="search-list">
          {items.map((it) => (
            <Link key={it.id} href={`${basePath}/${it.id}`} className="search-item">
              <span className="search-item-thumb" aria-hidden>
                {it.cover_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.cover_image_url} alt="" />
                ) : (
                  it.name.slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="search-item-name">{it.name}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

// Renders the cross-entity search panel that surfaces matched anime and
// singers above the openings list when the user has typed a query. Clicking
// a row navigates to the corresponding /anime/:id or /singers/:id page.
export default function SearchResults({ q, anime, singers }: Props) {
  if (!q.trim()) return null;
  if (anime.length === 0 && singers.length === 0) return null;

  return (
    <div className="search-panel">
      <Column title="Anime" basePath="/anime" items={anime} />
      <Column title="Singers" basePath="/singers" items={singers} />
    </div>
  );
}
