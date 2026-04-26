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

export default function RoadmapPage({ user, modQueueCount }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Roadmap · Opening Wiki">
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 720 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 16px" }}>Roadmap</h1>
        <p style={{ color: "var(--fg-2)" }}>
          Public roadmap is in progress. Until then, follow the project repository
          for milestones and release notes.
        </p>
      </div>
    </Layout>
  );
}
