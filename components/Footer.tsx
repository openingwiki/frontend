import Link from "next/link";

export default function Footer() {
  return (
    <footer>
      <div className="wrap foot-inner">
        <div className="foot-links">
          <Link href="/?kind=opening">Openings</Link>
          <Link href="/?kind=ending">Endings</Link>
          <Link href="/?kind=ost">OSTs</Link>
          <span className="foot-sep" />
          <Link href="/about">About</Link>
          <Link href="/roadmap">Roadmap</Link>
          <Link href="/moderation-policy">Moderation policy</Link>
        </div>
        <div className="foot-brand">
          <span className="foot-mark" />
          Opening Wiki · v0.2
        </div>
      </div>
    </footer>
  );
}
