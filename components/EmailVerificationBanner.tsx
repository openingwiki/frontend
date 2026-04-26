import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
}

type ResendState = "idle" | "sending" | "sent" | "error";

// Renders two things tied to the email-verification flow:
//   1. A persistent banner at the top of every page when the user is logged in
//      but email_verified === false. The banner stays until the user follows
//      the link in their inbox; the next SSR request reads the verified flag
//      from /me and the banner drops out.
//   2. A one-shot modal triggered by ?signup=pending after registration. The
//      modal explains a confirmation link was emailed; dismissing it strips
//      the query param so a refresh doesn't show it again.
export default function EmailVerificationBanner({ user }: Props) {
  const router = useRouter();
  const [resendState, setResendState] = useState<ResendState>("idle");
  const [resendError, setResendError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

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

  const resend = async () => {
    setResendState("sending");
    setResendError(null);
    try {
      const res = await fetch("/api/auth/resend-verification", { method: "POST" });
      if (res.ok) {
        setResendState("sent");
      } else {
        const body = await res.json().catch(() => ({}));
        setResendState("error");
        setResendError(body?.error ?? "Could not resend. Try again later.");
      }
    } catch {
      setResendState("error");
      setResendError("Could not reach the server.");
    }
  };

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
          disabled={resendState === "sending" || resendState === "sent"}
        >
          {resendState === "sending" && "Sending…"}
          {resendState === "sent" && "Link sent"}
          {(resendState === "idle" || resendState === "error") && "Resend link"}
        </button>
        {resendState === "error" && resendError && <span className="verify-banner-error">{resendError}</span>}
      </div>

      {showModal && (
        <div className="verify-modal-backdrop" onClick={dismissModal}>
          <div className="verify-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h2>Check your inbox</h2>
            <p>
              We sent a confirmation link to <strong>{user.email}</strong>. Click it to activate your
              account. Until then you can browse, but posting, rating, and group editing are blocked.
            </p>
            <div className="actions">
              <button type="button" className="btn" onClick={resend} disabled={resendState === "sending"}>
                {resendState === "sending" ? "Sending…" : resendState === "sent" ? "Link sent" : "Resend link"}
              </button>
              <button type="button" className="btn primary" onClick={dismissModal}>Got it</button>
            </div>
            {resendState === "error" && resendError && <p className="mock-notice">{resendError}</p>}
          </div>
        </div>
      )}
    </>
  );
}
