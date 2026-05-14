import Head from "next/head";
import type { ReactNode } from "react";
import type { User } from "@/lib/types";
import Topbar from "./Topbar";
import Rolebar from "./Rolebar";
import Footer from "./Footer";
import EmailVerificationBanner from "./EmailVerificationBanner";
import MobileNav from "./MobileNav";

interface Props {
  children: ReactNode;
  user: User | null;
  modQueueCount?: number;
  title?: string;
  description?: string;
}

export default function Layout({
  children,
  user,
  modQueueCount = 0,
  title = "Opening Wiki",
  description = "Community catalogue of anime opening themes.",
}: Props) {
  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        {/* `interactive-widget=resizes-content` lets newer Chromium /
            WebKit shrink the layout viewport when the on-screen keyboard
            appears, so fixed-bottom inputs (the in-match search bar) ride
            above the keyboard natively. Older browsers fall back to the
            useKeyboardInset hook. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <Topbar user={user} />
      <EmailVerificationBanner user={user} />
      <Rolebar user={user} modQueueCount={modQueueCount} />
      <div className="page-body">{children}</div>
      <Footer />
      <MobileNav user={user} modQueueCount={modQueueCount} />
    </>
  );
}
