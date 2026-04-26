import LiveSearchInput from "./LiveSearchInput";

interface Props {
  total: number;
  anime: number;
  singers: number;
  q: string;
}

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
      <LiveSearchInput
        basePath="/"
        initialQ={q}
        placeholder="Search by opening, anime, or singer…"
        ariaLabel="Search"
        showKbdBadge
      />
    </div>
  );
}
