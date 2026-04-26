import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

// Admin-only.
export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: { user: session.user, modQueueCount: session.modQueueCount } };
};

export default function AdminUsersPage({ user, modQueueCount }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="User management">
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
          User management
        </h1>
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
          Promote / demote moderators. Lands in M7.
        </p>
      </div>
    </Layout>
  );
}
