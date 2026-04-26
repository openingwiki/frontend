interface Props {
  total: number;
  anime: number;
  singers: number;
  q: string;
}

const SEARCH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

// Renders a real <form method="GET" action="/"> so the search submits without
// JS — staying true to the SSR-first design choice in REQUIREMENTS.
export default function SearchHeader({ total, anime, singers, q }: Props) {
  return (
    <div className="head">
      <h1>
        Anime <em>openings.</em>
      </h1>
      <p>
        Community catalogue · {total.toLocaleString()} openings ·{" "}
        {anime.toLocaleString()} anime · {singers.toLocaleString()} singers
      </p>
      <form className="search" action="/" method="get">
        {SEARCH_ICON}
        <input
          name="q"
          defaultValue={q}
          placeholder="Search by opening, anime, or singer…"
          aria-label="Search"
        />
        <span className="kbd">⌘K</span>
      </form>
    </div>
  );
}
