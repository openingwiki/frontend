import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import { loadSession, serializeSession } from "@/lib/session";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  return { props: serializeSession(session) };
};

export default function AboutPage({ user, modQueueCount }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="About · Opening Wiki">
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 720 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 16px" }}>About</h1>
        <p style={{ color: "var(--fg-2)", marginBottom: 14 }}>
          Opening Wiki is a community catalogue of anime opening themes — searchable,
          rateable, and shareable through public groups.
        </p>
        <p style={{ color: "var(--fg-2)" }}>
          Submissions go through moderation; ratings shape the community top lists.
        </p>
      </div>
    </Layout>
  );
}
