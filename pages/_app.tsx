import type { AppProps } from "next/app";
import ToastHost from "@/components/ToastHost";
import "@/styles/globals.css";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <ToastHost />
    </>
  );
}
