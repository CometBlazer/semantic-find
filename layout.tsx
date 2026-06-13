// ============================================================
// app/layout.tsx
// ============================================================
// Standard App Router root layout. Imports the global stylesheet
// and loads the two fonts: a serif for the demo "webpage" being
// searched, and the system sans stack (in CSS) for the finder
// overlay — the visual cue that the overlay is a tool sitting on
// top of someone else's content.
// ============================================================

import type { Metadata } from "next";
import { Source_Serif_4 } from "next/font/google";
import "./globals.css";

const serif = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-doc",
  weight: ["400", "600", "700"],
});

export const metadata: Metadata = {
  title: "Semantic Find — local Ctrl+F with embeddings",
  description:
    "A superpowered Ctrl+F: in-browser semantic search over page text using transformers.js. No server, no API keys.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={serif.variable}>{children}</body>
    </html>
  );
}
