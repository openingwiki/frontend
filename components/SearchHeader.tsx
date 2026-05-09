import LiveSearchInput from "./LiveSearchInput";
import type { TrackKind } from "@/lib/types";

const KIND_LABELS: Record<TrackKind, { word: string; placeholder: string }> = {
  opening: { word: "openings.",  placeholder: "Search by opening title, anime, or singer…" },
  ending:  { word: "endings.",   placeholder: "Search by ending title, anime, or singer…" },
  ost:     { word: "OSTs.",      placeholder: "Search by OST track, anime, or singer…" },
};

interface Props {
  total: number;
  anime?: number;
  singers?: number;
  q: string;
  kind: TrackKind;
}

export default function SearchHeader({ total, anime = 0, singers = 0, q, kind }: Props) {
  const { word, placeholder } = KIND_LABELS[kind];
  const statParts: string[] = [`${total.toLocaleString()} tracks`];
  if (anime > 0) statParts.push(`${anime.toLocaleString()} anime`);
  if (singers > 0) statParts.push(`${singers.toLocaleString()} singers`);

  return (
    <div className="head">
      <h1>
        Anime <em>{word}</em>
      </h1>
      <p>Community catalogue · {statParts.join(" · ")}</p>
      <LiveSearchInput
        basePath="/"
        initialQ={q}
        placeholder={placeholder}
        ariaLabel="Search"
        showKbdBadge
      />
    </div>
  );
}
