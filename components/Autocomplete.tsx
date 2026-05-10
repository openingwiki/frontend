import { useState, useRef, useEffect, useCallback } from "react";

export interface AutocompleteItem {
  id: string;
  label: string;
  sublabel?: string;
}

interface Props {
  placeholder: string;
  fetchItems: (q: string) => Promise<AutocompleteItem[]>;
  selected: AutocompleteItem | null;
  onSelect: (item: AutocompleteItem | null) => void;
  inputName?: string;
}

export default function Autocomplete({ placeholder, fetchItems, selected, onSelect, inputName }: Props) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<AutocompleteItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const results = await fetchItems(q);
      setItems(results);
      setOpen(true);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [fetchItems]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => search(q), 250);
  };

  const handleSelect = (item: AutocompleteItem) => {
    onSelect(item);
    setQuery("");
    setItems([]);
    setOpen(false);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (selected) {
    return (
      <div className="ac-chip">
        {inputName && <input type="hidden" name={inputName} value={selected.id} />}
        <span className="ac-chip-label">{selected.label}</span>
        {selected.sublabel && <span className="ac-chip-sub">{selected.sublabel}</span>}
        <button type="button" className="ac-chip-clear" onClick={() => onSelect(null)} aria-label="Clear">×</button>
      </div>
    );
  }

  return (
    <div className="ac-wrap" ref={containerRef}>
      {inputName && <input type="hidden" name={inputName} value="" />}
      <input
        className="ac-input"
        value={query}
        onChange={handleChange}
        onFocus={() => { if (!open) search(query); }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {open && items.length > 0 && (
        <ul className="ac-dropdown">
          {items.map((item) => (
            <li key={item.id} className="ac-item" onMouseDown={() => handleSelect(item)}>
              <span className="ac-item-label">{item.label}</span>
              {item.sublabel && <span className="ac-item-sub">{item.sublabel}</span>}
            </li>
          ))}
        </ul>
      )}
      {open && !loading && items.length === 0 && query.length > 0 && (
        <div className="ac-empty">No results</div>
      )}
    </div>
  );
}
