import { useEffect } from "react";

// Tracks how much of the bottom of the layout viewport the on-screen
// keyboard is covering, and writes it to a `--kbd-inset` CSS variable on
// the document root so layout-fixed elements (the in-match search bar +
// its suggestions) can ride above the keyboard instead of being hidden
// behind it.
//
// Newer Chromium/WebKit honor `env(keyboard-inset-height)` and
// `<meta name="viewport" content="…, interactive-widget=resizes-content">`
// natively — on those browsers this hook is a redundant safety net, but
// it's cheap (one event listener, no re-renders) and degrades gracefully:
// when `visualViewport` is unavailable the var simply stays unset and the
// CSS falls back to the `env()` chain.
export function useKeyboardInset() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vp = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const inset = Math.max(0, window.innerHeight - (vp.height + vp.offsetTop));
      root.style.setProperty("--kbd-inset", `${inset}px`);
    };
    update();
    vp.addEventListener("resize", update);
    vp.addEventListener("scroll", update);
    return () => {
      vp.removeEventListener("resize", update);
      vp.removeEventListener("scroll", update);
      root.style.removeProperty("--kbd-inset");
    };
  }, []);
}
