import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

// Mod-only route. Anything below moderator gets bounced to home (REQUIREMENTS §3).
export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user || (session.user.role !== "moderator" && session.user.role !== "admin")) {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: { user: session.user, modQueueCount: session.modQueueCount } };
};

export default function ModQueuePage({ user, modQueueCount }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Moderation queue">
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
          Moderation queue
        </h1>
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
          {modQueueCount} pending submissions.
        </p>
        <p style={{ marginTop: 32, color: "var(--fg-3)" }}>
          Queue list UI lands in M3. The Go API exposes <code>/mod/queue</code> per REQUIREMENTS §6.
        </p>
      </div>
    </Layout>
  );
}
