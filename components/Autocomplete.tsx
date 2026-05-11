import { useState, useRef, useEffect, useCallback } from "react";

export interface AutocompleteItem {
  id: string;
  label: string;
  sublabel?: string;
  coverUrl?: string | null;
  iconShape?: "square" | "circle";
}

interface Props {
  placeholder: string;
  fetchItems: (q: string) => Promise<AutocompleteItem[]>;
  selected: AutocompleteItem | null;
  onSelect: (item: AutocompleteItem | null) => void;
  onCreateNew?: () => void;
  createNewLabel?: string;
}

export default function Autocomplete({ placeholder, fetchItems, selected, onSelect, onCreateNew, createNewLabel }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AutocompleteItem[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    try {
      const results = await fetchItems(q);
      setItems(results);
      setOpen(true);
      setActiveIdx(-1);
    } catch {
      setItems([]);
    }
  }, [fetchItems]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q), 250);
  };

  const handleFocus = () => {
    if (!open) search(query);
  };

  const handleSelect = (item: AutocompleteItem) => {
    onSelect(item);
    setQuery("");
    setItems([]);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    const total = items.length + (onCreateNew ? 1 : 0);
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, total - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && activeIdx < items.length) handleSelect(items[activeIdx]);
      else if (activeIdx === items.length && onCreateNew) onCreateNew();
    }
    else if (e.key === "Escape") setOpen(false);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="auto" ref={wrapRef}>
      {selected ? (
        <div className="auto-selected">
          <div className={`auto-ic${selected.iconShape === "circle" ? " circle" : ""}`}>
            {selected.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.coverUrl} alt="" />
            )}
          </div>
          <span>{selected.label}</span>
          {selected.sublabel && <span style={{ color: "var(--fg-3)", fontSize: 11, fontFamily: "var(--mono)" }}>{selected.sublabel}</span>}
          <button type="button" className="x" onClick={() => onSelect(null)} aria-label="Clear">×</button>
        </div>
      ) : (
        <div className={`auto-wrap${open ? " open" : ""}`}>
          <input
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoComplete="off"
          />
          {open && (items.length > 0 || onCreateNew) && (
            <div className="auto-results">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className={`auto-row${i === activeIdx ? " sel" : ""}`}
                  onMouseDown={() => handleSelect(item)}
                  onMouseEnter={() => setActiveIdx(i)}
                >
                  <div className={`ic${item.iconShape === "circle" ? " circle" : ""}`}>
                    {item.coverUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.coverUrl} alt="" />
                    )}
                  </div>
                  <div>
                    <div className="a-name">{item.label}</div>
                    {item.sublabel && <div className="a-sub">{item.sublabel}</div>}
                  </div>
                  {i === activeIdx && <span className="a-pick">↵ pick</span>}
                </div>
              ))}
              {onCreateNew && (
                <div
                  className={`auto-row create${activeIdx === items.length ? " sel" : ""}`}
                  onMouseDown={onCreateNew}
                  onMouseEnter={() => setActiveIdx(items.length)}
                >
                  <div className="ic">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                  </div>
                  <div>
                    <div className="a-name">{createNewLabel ?? "Add new…"}</div>
                    <div className="a-sub">opens the form</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
