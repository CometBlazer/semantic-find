"use client";

// ============================================================
// app/page.tsx
// ============================================================
// The page itself is a client component for one reason: in the
// App Router, `dynamic(..., { ssr: false })` is only allowed
// inside client components. The ssr:false boundary guarantees
// SemanticFindDemo — and therefore @huggingface/transformers —
// is never evaluated on the server. The model loads, runs, and
// stays in the browser.
// ============================================================

import dynamic from "next/dynamic";

const SemanticFindDemo = dynamic(
  () => import("@/components/SemanticFindUI"),
  {
    ssr: false,
    loading: () => <p className="sf-booting">Loading semantic find…</p>,
  }
);

export default function Page() {
  return <SemanticFindDemo />;
}
