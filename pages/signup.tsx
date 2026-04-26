import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (session.user) return { redirect: { destination: "/", permanent: false } };
  return { props: { user: null, modQueueCount: 0 } };
};

export default function SignupPage({ user, modQueueCount }: Props) {
  const router = useRouter();
  const next = typeof router.query.next === "string" ? router.query.next : "/";
  const error = typeof router.query.error === "string" ? router.query.error : null;

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Sign up · Opening Wiki">
      <div className="formpage">
        <h1>Create your account</h1>
        <p>Rate openings, build groups, share public playlists.</p>
        {error && <p className="mock-notice">{error}</p>}
        <form action="/api/auth/signup" method="post">
          <input type="hidden" name="next" value={next} />
          <div>
            <label htmlFor="display_name">Display name</label>
            <input id="display_name" name="display_name" required maxLength={40} />
          </div>
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
          </div>
          <div className="actions">
            <button type="submit" className="btn primary">Sign up</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
