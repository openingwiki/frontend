import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { pushToast } from "@/lib/toast";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
}

const COOLDOWN_MS = 60_000;
// Persisted across reloads so a user can't bypass the throttle by refreshing.
// Key includes the userId so a different user on the same device starts fresh.
const storageKey = (userId: string) => `ow_resend_until_${userId}`;

function readUntil(userId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function useResendCooldown(userId: string | null) {
  const [until, setUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!userId) return;
    setUntil(readUntil(userId));
  }, [userId]);

  useEffect(() => {
    if (until <= now) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [until, now]);

  const remaining = Math.max(0, until - now);
  const start = useCallback(() => {
    if (!userId) return;
    const u = Date.now() + COOLDOWN_MS;
    window.localStorage.setItem(storageKey(userId), String(u));
    setUntil(u);
    setNow(Date.now());
  }, [userId]);

  return { remaining, start };
}

export default function EmailVerificationBanner({ user }: Props) {
  const router = useRouter();
  const [sending, setSending] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const { remaining, start } = useResendCooldown(user?.id ?? null);

  useEffect(() => {
    if (router.query.signup === "pending" && user && !user.email_verified) {
      setShowModal(true);
    }
  }, [router.query.signup, user]);

  if (!user || user.email_verified) return null;

  const dismissModal = () => {
    setShowModal(false);
    const { signup, ...rest } = router.query;
    void signup;
    router.replace({ pathname: router.pathname, query: rest }, undefined, { shallow: true });
  };

  const cooldownActive = remaining > 0;
  const cooldownSec = Math.ceil(remaining / 1000);

  const resend = async () => {
    if (sending || cooldownActive) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (res.ok) {
        start();
        pushToast({ kind: "success", message: "Verification link sent — check your inbox" });
      } else {
        const body = await res.json().catch(() => ({}));
        pushToast({
          kind: "error",
          message: body?.error ?? "Could not resend. Try again shortly.",
        });
        // Still start a short cooldown on error so we don't hammer the server.
        start();
      }
    } catch {
      pushToast({ kind: "error", message: "Could not reach the server." });
    } finally {
      setSending(false);
    }
  };

  const buttonLabel = sending
    ? "Sending…"
    : cooldownActive
      ? `Resend in ${cooldownSec}s`
      : "Resend link";
  const disabled = sending || cooldownActive;

  return (
    <>
      <div className="verify-banner" role="status">
        <span>
          Confirm your email <strong>{user.email}</strong> to post openings, rate, and manage groups.
        </span>
        <button
          type="button"
          className="verify-banner-resend"
          onClick={resend}
          disabled={disabled}
        >
          {buttonLabel}
        </button>
      </div>

      {showModal && (
        <div className="verify-modal-backdrop" onClick={dismissModal}>
          <div
            className="verify-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Check your inbox</h2>
            <p>
              We sent a confirmation link to <strong>{user.email}</strong>. Click it to activate
              your account. Until then you can browse, but posting, rating, and group editing
              are blocked.
            </p>
            <div className="actions">
              <button type="button" className="btn" onClick={resend} disabled={disabled}>
                {buttonLabel}
              </button>
              <button type="button" className="btn primary" onClick={dismissModal}>Got it</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
