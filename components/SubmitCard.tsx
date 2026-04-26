import Link from "next/link";

interface Props {
  // Anonymous users see the same callout but it routes through /login first.
  authed: boolean;
}

export default function SubmitCard({ authed }: Props) {
  const href = authed ? "/submit" : "/login?next=/submit";
  return (
    <div className="panel submit-card">
      <h4>Know one we&apos;re missing?</h4>
      <p>
        Submit an opening in under a minute — just a YouTube link, title,
        anime, and singer.
      </p>
      <Link href={href} className="btn primary">+ Submit an opening</Link>
    </div>
  );
}
