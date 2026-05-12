import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { useState } from "react";
import Link from "next/link";

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (session.user) {
    return { redirect: { destination: "/me", permanent: false } };
  }
  return { props: { user: null, modQueueCount: 0 } };
};

type Status = "idle" | "loading" | "sent" | "error";

export default function ForgotPasswordPage({ user, modQueueCount }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setError(null);
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    try {
      await fetch("/api/auth/request-password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setStatus("sent");
    } catch {
      setStatus("error");
      setError("Could not reach the server. Try again in a moment.");
    }
  }

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Forgot password · Opening Wiki">
      <div className="formpage">
        <h1>Forgot password</h1>
        {status === "sent" ? (
          <>
            <p>If that email has an account, we sent a reset link. Check your inbox — the link is valid for 1 hour.</p>
            <div className="actions">
              <Link href="/login" className="btn">Back to login</Link>
            </div>
          </>
        ) : (
          <>
            <p>Enter your email and we'll send you a link to reset your password.</p>
            {error && <p className="mock-notice">{error}</p>}
            <form onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email">Email</label>
                <input id="email" name="email" type="email" required autoComplete="email" />
              </div>
              <div className="actions">
                <button type="submit" className="btn primary" disabled={status === "loading"}>
                  {status === "loading" ? "Sending…" : "Send reset link"}
                </button>
                <Link href="/login" className="btn">Cancel</Link>
              </div>
            </form>
          </>
        )}
      </div>
    </Layout>
  );
}
