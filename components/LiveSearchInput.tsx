import { useRouter } from "next/router";
import { type FormEvent, useEffect, useRef, useState } from "react";

interface Props {
  basePath: string;
  initialQ: string;
  placeholder: string;
  ariaLabel: string;
  autoFocus?: boolean;
  showKbdBadge?: boolean;
  debounceMs?: number;
}

const SEARCH_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);

// Controlled search input that pushes ?q= into the URL after a short debounce.
// SSR pages re-run getServerSideProps on the URL change, so each "fire" yields a
// fresh result set without manual fetch/state plumbing. Form Enter still works
// as an immediate-flush fast path; with JS off the form submits as plain GET.
export default function LiveSearchInput({
  basePath,
  initialQ,
  placeholder,
  ariaLabel,
  autoFocus,
  showKbdBadge,
  debounceMs = 300,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(initialQ);
  const lastPushedRef = useRef(initialQ);

  // Keep local state in sync if the URL changes externally (back/forward,
  // clicking a "Clear" link). Skip if the change is one we just pushed.
  useEffect(() => {
    if (initialQ !== lastPushedRef.current) {
      setValue(initialQ);
      lastPushedRef.current = initialQ;
    }
  }, [initialQ]);

  useEffect(() => {
    if (value === lastPushedRef.current) return;
    const handle = setTimeout(() => pushQuery(value), debounceMs);
    return () => clearTimeout(handle);
    // pushQuery captures router/basePath which are stable for the page lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, debounceMs]);

  const pushQuery = (raw: string) => {
    const trimmed = raw.trim();
    lastPushedRef.current = raw;
    // Drop q + reset paginator on every search; preserve other filters (e.g. sort).
    const { q: _q, page: _page, ...rest } = router.query;
    void _q;
    void _page;
    const query: Record<string, string | string[]> = { ...(rest as Record<string, string | string[]>) };
    if (trimmed) query.q = trimmed;
    router.replace({ pathname: basePath, query }, undefined, { scroll: false });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    pushQuery(value);
  };

  return (
    <form className="search" action={basePath} method="get" onSubmit={onSubmit}>
      {SEARCH_ICON}
      <input
        name="q"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
      />
      {showKbdBadge && <span className="kbd">⌘K</span>}
    </form>
  );
}
