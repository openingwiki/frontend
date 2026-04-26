import Link from "next/link";

export default function AuthCard() {
  return (
    <div className="panel">
      <div className="auth-card">
        <h4>Start your catalogue.</h4>
        <p>
          Rate openings, build groups, and share public playlists with a link.
          Email + password — no extras.
        </p>
        <div className="row">
          <Link href="/signup" className="btn primary">Sign up</Link>
          <Link href="/login" className="btn">Log in</Link>
        </div>
      </div>
    </div>
  );
}
