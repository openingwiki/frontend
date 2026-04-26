import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

// Gate: submission is auth-only (REQUIREMENTS §3, §4.1).
export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: "/login?next=/submit", permanent: false } };
  }
  return {
    props: { user: session.user, modQueueCount: session.modQueueCount },
  };
};

export default function SubmitPage({ user, modQueueCount }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Submit an opening">
      <div className="formpage">
        <h1>Submit an opening</h1>
        <p>Goes to the moderation queue. Mods/admins are auto-approved.</p>
        <form action="/api/openings" method="post">
          <div>
            <label htmlFor="title">Opening title</label>
            <input id="title" name="title" required />
          </div>
          <div>
            <label htmlFor="youtube_url">YouTube URL</label>
            <input id="youtube_url" name="youtube_url" type="url" required placeholder="https://www.youtube.com/watch?v=…" />
          </div>
          <div>
            <label htmlFor="anime">Anime</label>
            <input id="anime" name="anime" required placeholder="Search or add new" />
          </div>
          <div>
            <label htmlFor="singer">Singer</label>
            <input id="singer" name="singer" required placeholder="Search or add new" />
          </div>
          <div className="actions">
            <button type="submit" className="btn primary">Submit for review</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
