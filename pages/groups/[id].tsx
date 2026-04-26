import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import { listMyGroups } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { Group, User } from "@/lib/types";

interface Props {
  user: User;
  modQueueCount: number;
  group: Group | null;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: `/login?next=/groups/${ctx.params?.id}`, permanent: false } };
  }
  const id = String(ctx.params?.id ?? "");
  const groups = await listMyGroups(session.cookie).catch(() => []);
  const group = groups.find((g) => g.id === id) ?? null;
  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      group,
    },
  };
};

export default function PrivateGroupPage({ user, modQueueCount, group }: Props) {
  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={group ? `${group.name} · My groups` : "Group not found"}
    >
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 720 }}>
        <p style={{ marginBottom: 12 }}>
          <Link href="/groups">← My groups</Link>
        </p>
        {group ? (
          <>
            <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
              {group.name}
            </h1>
            <p style={{ color: "var(--fg-3)", fontFamily: "var(--mono)", fontSize: 12, margin: "0 0 24px" }}>
              {group.is_system_rated ? "System · Rated" : group.is_public ? "Public" : "Private"} ·{" "}
              {group.opening_count} openings
            </p>
            {group.description && (
              <p style={{ color: "var(--fg-2)", marginBottom: 24 }}>{group.description}</p>
            )}
            <p style={{ color: "var(--fg-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
              Group contents view is coming soon. Use{" "}
              <Link href="/" style={{ color: "var(--accent)" }}>the catalogue</Link>{" "}
              to add openings to this group.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
              Group not found
            </h1>
            <p style={{ color: "var(--fg-2)" }}>
              This group does not exist, or you don&apos;t have access to it.
            </p>
          </>
        )}
      </div>
    </Layout>
  );
}
