import type { RefObject } from "react";
import { useEffect } from "react";

export function useSearchHotkey(inputRef: RefObject<HTMLInputElement>, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key.toLowerCase() !== "k") return;
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.altKey) return;

      e.preventDefault();

      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.select();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [enabled, inputRef]);
}
