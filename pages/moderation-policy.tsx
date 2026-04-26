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

export default function ModerationPolicyPage({ user, modQueueCount }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Moderation policy · Opening Wiki">
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 720 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
          Moderation policy
        </h1>
        <p style={{ color: "var(--fg-2)", marginBottom: 14 }}>
          Submissions are reviewed before they appear in the public catalogue.
          Moderators check for accuracy (anime/singer match, working YouTube link)
          and remove duplicates, low-effort content, and copyright-flagged sources.
        </p>
        <p style={{ color: "var(--fg-2)" }}>
          Repeated bad-faith submissions or rating manipulation lead to account
          suspension. Appeals can be sent to the project maintainers.
        </p>
      </div>
    </Layout>
  );
}
