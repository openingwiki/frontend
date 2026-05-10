import { useEffect, useRef, useState } from "react";

export interface SortOption<K extends string = string> {
  key: K;
  label: string;
  hint?: string;
}

interface Props<K extends string> {
  options: SortOption<K>[];
  value: K;
  onChange: (key: K) => void;
}

const CHEVRON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export default function LocalSortDropdown<K extends string>({ options, value, onChange }: Props<K>) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.key === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
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
          {options.map((o) => (
            <li key={o.key}>
              <button
                type="button"
                className={`sort-pop-item${value === o.key ? " on" : ""}`}
                role="option"
                aria-selected={value === o.key}
                onClick={() => { onChange(o.key); setOpen(false); }}
              >
                <span className="sort-pop-l">{o.label}</span>
                {o.hint && <span className="sort-pop-h">{o.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
