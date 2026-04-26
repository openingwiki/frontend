import Link from "next/link";

export default function Footer() {
  return (
    <footer>
      <div className="wrap foot-inner">
        <div>
          <Link href="/about">About</Link>
          <Link href="/roadmap">Roadmap</Link>
          <Link href="/moderation-policy">Moderation policy</Link>
        </div>
        <div>Opening Wiki · v0.1</div>
      </div>
    </footer>
  );
}
