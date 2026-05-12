import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import Link from "next/link";
import { useState } from "react";
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

type Status = "idle" | "loading" | "success" | "error";

export default function ResetPasswordPage({ user, modQueueCount, token }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return (
      <Layout user={user} modQueueCount={modQueueCount} title="Reset password · Opening Wiki">
        <div className="formpage">
          <h1>Reset password</h1>
          <p className="mock-notice">This reset link is missing a token. Request a new one below.</p>
          <div className="actions">
            <Link href="/forgot-password" className="btn primary">Request new link</Link>
          </div>
        </div>
      </Layout>
    );
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    const form = e.currentTarget;
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirm = (form.elements.namedItem("confirm") as HTMLInputElement).value;
    if (password !== confirm) {
      setStatus("error");
      setError("Passwords don't match.");
      return;
    }
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      if (res.ok) {
        setStatus("success");
        setTimeout(() => router.push("/login"), 2500);
      } else {
        const body = await res.json().catch(() => ({}));
        setStatus("error");
        setError(body?.error ?? "Reset failed. The link may be expired.");
      }
    } catch {
      setStatus("error");
      setError("Could not reach the server. Try again in a moment.");
    }
  }

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Reset password · Opening Wiki">
      <div className="formpage">
        <h1>Reset password</h1>
        {status === "success" ? (
          <p>Password updated. Redirecting to login…</p>
        ) : (
          <>
            {error && <p className="mock-notice">{error}</p>}
            <form onSubmit={handleSubmit}>
              <div>
                <label htmlFor="password">New password</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label htmlFor="confirm">Confirm new password</label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>
              <div className="actions">
                <button type="submit" className="btn primary" disabled={status === "loading"}>
                  {status === "loading" ? "Saving…" : "Set new password"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </Layout>
  );
}
