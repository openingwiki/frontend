import Link from "next/link";
import type { TrackKind } from "@/lib/types";

interface Tab {
  kind: TrackKind;
  label: string;
  subtitle: string;
}

const TABS: Tab[] = [
  { kind: "opening", label: "Openings", subtitle: "OP · INTRO · ~90s" },
  { kind: "ending",  label: "Endings",  subtitle: "ED · OUTRO · ~90s" },
  { kind: "ost",     label: "OSTs",     subtitle: "OST · TRACK" },
];

interface Props {
  activeKind: TrackKind;
  counts: Record<TrackKind, number>;
  q?: string;
  sort?: string;
}

function buildHref(kind: TrackKind, q?: string, sort?: string): string {
  const params = new URLSearchParams();
  params.set("kind", kind);
  if (q) params.set("q", q);
  if (sort && sort !== "top") params.set("sort", sort);
  return `/?${params.toString()}`;
}

export default function CatalogTabs({ activeKind, counts, q, sort }: Props) {
  return (
    <div className="cat-tabs" role="tablist" aria-label="Catalog type">
      {TABS.map((tab) => {
        const active = tab.kind === activeKind;
        return (
          <Link
            key={tab.kind}
            href={buildHref(tab.kind, q, sort)}
            className={`cat-tab${active ? " on" : ""}`}
            role="tab"
            aria-selected={active}
            scroll={false}
          >
            <span className="cat-tab-label">
              {tab.label}
              <span className="cat-tab-count">{counts[tab.kind].toLocaleString()}</span>
            </span>
            <span className="cat-tab-sub">{tab.subtitle}</span>
          </Link>
        );
      })}
    </div>
  );
}
