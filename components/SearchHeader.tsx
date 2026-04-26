import LiveSearchInput from "./LiveSearchInput";

interface Props {
  total: number;
  // Kept in the prop shape for callers that still pass them; not rendered
  // now that anime/singer browse is hidden.
  anime?: number;
  singers?: number;
  q: string;
}

export default function SearchHeader({ total, q }: Props) {
  return (
    <div className="head">
      <h1>
        Anime <em>openings.</em>
      </h1>
      <p>
        Community catalogue · {total.toLocaleString()} openings.
      </p>
      <LiveSearchInput
        basePath="/"
        initialQ={q}
        placeholder="Search openings by title…"
        ariaLabel="Search"
        showKbdBadge
      />
    </div>
  );
}
