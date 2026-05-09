import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import type { SortKey, TrackKind } from "@/lib/types";

interface Props {
  total: number;
  sort: SortKey;
  basePath: string;
  q?: string;
  kind?: TrackKind;
}

const OPTIONS: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: "newest",     label: "Newest",     hint: "Recently approved first" },
  { key: "top",        label: "Top rated",  hint: "Highest average score" },
  { key: "most_rated", label: "Most rated", hint: "Largest rating count" },
];

function buildHref(base: string, q: string | undefined, key: SortKey, kind?: TrackKind) {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (q) params.set("q", q);
  params.set("sort", key);
  return `${base}?${params.toString()}`;
}

const CHEVRON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

// Click-to-open sort menu. Each option is a real <Link> for SSR-friendly
// no-JS fallback, but in the browser we hijack the click and call
// router.push explicitly — that guarantees getServerSideProps re-runs and
// the new sort actually takes effect (some Link/Link-onClick combos can
// otherwise close the popup before the navigation fires).
export default function SortBar({ total, sort, basePath, q, kind }: Props) {
  const router = useRouter();
  const current = OPTIONS.find((o) => o.key === sort) ?? OPTIONS[0];
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const select = (key: SortKey, e: React.MouseEvent) => {
    // Plain left-click without modifier keys → handle via router.push so SSR
    // re-runs reliably. Cmd/Ctrl/middle-click falls through to <Link> default
    // behaviour (open in new tab).
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    setOpen(false);
    router.push(buildHref(basePath, q, key, kind), undefined, { scroll: false });
  };

  return (
    <div className="sort-bar">
      <span>
        <span className="count">{total.toLocaleString()}</span> openings
      </span>
      <span className="spacer" />

      <div className={`sort-menu${open ? " open" : ""}`} ref={wrapRef}>
        <button
          type="button"
          className="sort-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sort-trigger-l">Sort</span>
          <span className="sort-trigger-v">{current.label}</span>
          <span className={`sort-trigger-c${open ? " up" : ""}`}>{CHEVRON}</span>
        </button>

        {open && (
          <ul className="sort-pop" role="listbox">
            {OPTIONS.map((o) => (
              <li key={o.key}>
                <Link
                  href={buildHref(basePath, q, o.key, kind)}
                  className={`sort-pop-item${sort === o.key ? " on" : ""}`}
                  onClick={(e) => select(o.key, e)}
                  role="option"
                  aria-selected={sort === o.key}
                >
                  <span className="sort-pop-l">{o.label}</span>
                  <span className="sort-pop-h">{o.hint}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {/* No-JS fallback */}
        <noscript>
          <div className="sort">
            {OPTIONS.map((o) => (
              <Link
                key={o.key}
                href={buildHref(basePath, q, o.key)}
                className={`sort-btn${sort === o.key ? " on" : ""}`}
              >
                {o.label}
              </Link>
            ))}
          </div>
        </noscript>
      </div>
    </div>
  );
}
