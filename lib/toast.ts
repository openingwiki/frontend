// Tiny pub/sub toast bus. Components emit via pushToast(); the global
// <ToastHost /> mounted in _app.tsx renders the queue at the bottom of the
// viewport. Keeps state out of React context so any module (api wrappers,
// SSR-hydrated effects) can fire toasts without prop-drilling.

export type ToastKind = "error" | "success" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  // ms — toast auto-dismisses after this; null/0 for sticky.
  durationMs: number;
}

type Listener = (toasts: Toast[]) => void;

let nextId = 1;
let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  // Snapshot so subscribers can use Array methods safely.
  const snapshot = [...toasts];
  for (const listener of listeners) listener(snapshot);
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  listener([...toasts]);
  return () => {
    listeners.delete(listener);
  };
}

export interface ToastInput {
  kind?: ToastKind;
  message: string;
  durationMs?: number;
}

export function pushToast(input: ToastInput): number {
  const toast: Toast = {
    id: nextId++,
    kind: input.kind ?? "info",
    message: input.message,
    durationMs: input.durationMs ?? (input.kind === "error" ? 6000 : 4000),
  };
  toasts = [...toasts, toast];
  emit();

  if (toast.durationMs > 0) {
    setTimeout(() => dismissToast(toast.id), toast.durationMs);
  }
  return toast.id;
}

export function dismissToast(id: number) {
  const before = toasts.length;
  toasts = toasts.filter((t) => t.id !== id);
  if (toasts.length !== before) emit();
}

export function clearToasts() {
  if (toasts.length === 0) return;
  toasts = [];
  emit();
}
