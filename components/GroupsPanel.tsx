import Link from "next/link";
import type { Group } from "@/lib/types";

interface Props {
  groups: Group[];
}

const STAR = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
  </svg>
);
const LINK_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71" />
  </svg>
);
const LOCK_ICON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="5" y="11" width="14" height="10" rx="1" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </svg>
);

function modifier(g: Group): string {
  if (g.is_system_rated) return "system";
  if (g.is_public) return "public";
  return "";
}

function icon(g: Group) {
  if (g.is_system_rated) return STAR;
  if (g.is_public) return LINK_ICON;
  return LOCK_ICON;
}

export default function GroupsPanel({ groups }: Props) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span>Your groups</span>
        <Link href="/groups?new=1">+ New</Link>
      </div>

      <div className="grp-list">
        {groups.map((g) => (
          <Link
            key={g.id}
            className={`grp-item ${modifier(g)}`.trim()}
            href={g.is_public && g.share_slug ? `/g/${g.share_slug}` : `/groups/${g.id}`}
          >
            <span className="grp-icon">{icon(g)}</span>
            <span className="grp-name">{g.name}</span>
            <span className="grp-count">{g.opening_count}</span>
          </Link>
        ))}
      </div>

      <div className="panel-foot">
        <Link href="/groups">Manage all groups →</Link>
      </div>
    </div>
  );
}
