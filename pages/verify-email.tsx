import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useEffect, useState } from "react";
import Layout from "@/components/Layout";
import { loadSession, serializeSession } from "@/lib/session";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  token: string;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const token = typeof ctx.query.token === "string" ? ctx.query.token : "";
  return { props: { ...serializeSession(session), token } };
};

type Status = "idle" | "verifying" | "success" | "error";

export default function VerifyEmailPage({ user, modQueueCount, token }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Verification link is missing the token.");
      return;
    }
    let cancelled = false;
    setStatus("verifying");
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          setStatus("success");
        } else {
          const body = await res.json().catch(() => ({}));
          setStatus("error");
          setError(body?.error ?? "Verification failed. The link may be expired.");
        }
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setError("Could not reach the server. Try again in a moment.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Verify email · Opening Wiki">
      <div className="formpage">
        <h1>Email verification</h1>
        {status === "verifying" && <p className="mock-notice">Verifying your email…</p>}
        {status === "success" && (
          <>
            <p>Your email is confirmed. You can now post, rate, and manage groups.</p>
            <div className="actions">
              <Link href="/" className="btn primary">Continue</Link>
            </div>
          </>
        )}
        {status === "error" && (
          <>
            <p className="mock-notice">{error}</p>
            <div className="actions">
              <Link href="/" className="btn">Go home</Link>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
