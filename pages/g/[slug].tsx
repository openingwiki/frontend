import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  slug: string;
}

// Public group view — no auth required (REQUIREMENTS §3, §4.4).
export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      slug: String(ctx.params?.slug ?? ""),
    },
  };
};

export default function PublicGroupPage({ user, modQueueCount, slug }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title={`Shared group · ${slug}`}>
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
          Shared group
        </h1>
        <p style={{ color: "var(--fg-3)", fontFamily: "var(--mono)", fontSize: 12 }}>
          Slug: <code>{slug}</code> · loads from <code>GET /g/{slug}</code> in M6.
        </p>
      </div>
    </Layout>
  );
}
