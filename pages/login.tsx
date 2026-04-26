import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  // Already logged in → bounce home.
  if (session.user) {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: { user: null, modQueueCount: 0 } };
};

export default function LoginPage({ user, modQueueCount }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Log in · Opening Wiki">
      <div className="formpage">
        <h1>Log in</h1>
        <p>Email + password — sessions are kept in a secure HTTP-only cookie.</p>
        <form action="/api/auth/login" method="post">
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <label htmlFor="password">Password</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" />
          </div>
          <div className="actions">
            <button type="submit" className="btn primary">Log in</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
