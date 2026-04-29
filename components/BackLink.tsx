import type { MouseEvent, ReactNode } from "react";
import { useRouter } from "next/router";

interface Props {
  children: ReactNode;
  className?: string;
  fallbackHref: string;
}

export default function BackLink({ children, className, fallbackHref }: Props) {
  const router = useRouter();

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    void router.push(fallbackHref);
  };

  return (
    <a href={fallbackHref} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
