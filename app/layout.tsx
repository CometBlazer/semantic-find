// ============================================================
// app/layout.tsx
// ============================================================
// Standard App Router root layout: page metadata plus the global
// stylesheet. Typography is set in CSS, not via next/font — a serif
// stack for the demo "webpage" being searched and a system sans
// stack for the finder overlay, the visual cue that the overlay is
// a tool sitting on top of someone else's content.
// ============================================================

import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
