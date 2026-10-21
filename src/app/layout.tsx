import type { Metadata } from "next";
import { Comic_Neue, Geist_Mono } from "next/font/google";
import "./globals.css";

/** Fallback for Comic Sans, which Linux and Android lack. */
const comicNeue = Comic_Neue({
  variable: "--font-comic-neue",
  weight: ["300", "400", "700"],
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "JobMe — Adaptive Mock Interview Room",
  description:
    "A voice mock interview where the recruiter actually listens. Every follow-up targets the weakest part of your last answer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${comicNeue.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
