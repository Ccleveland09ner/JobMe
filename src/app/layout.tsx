import type { Metadata } from "next";
import { Comic_Neue, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * The web fallback for Comic Sans, which is a system font and ships on
 * Windows and macOS but not on Linux or Android. Loaded so those platforms
 * land on a lookalike rather than a generic sans. Not a variable font — the
 * three weights it has are the three it has.
 */
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
