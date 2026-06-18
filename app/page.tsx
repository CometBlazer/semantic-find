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
import { useEffect, useState } from "react";

const SemanticFindDemo = dynamic(
  async () => {
    const { MODEL_ID, getExtractor } = await import("@/lib/embedding-client");

    return function SemanticFindWorkerDemo() {
      const [message, setMessage] = useState(`Loading ${MODEL_ID}...`);

      useEffect(() => {
        let cancelled = false;

        getExtractor((progress) => {
          if (cancelled || typeof progress.progress !== "number") return;
          setMessage(`Loading ${MODEL_ID}... ${Math.round(progress.progress)}%`);
        })
          .then(({ device }) => {
            if (!cancelled) setMessage(`Worker ready on ${device}.`);
          })
          .catch((error) => {
            if (!cancelled) {
              setMessage(
                error instanceof Error
                  ? `Could not start worker: ${error.message}`
                  : "Could not start worker."
              );
            }
          });

        return () => {
          cancelled = true;
        };
      }, []);

      return <p className="sf-booting">{message}</p>;
    };
  },
  {
    ssr: false,
    loading: () => <p className="sf-booting">Loading semantic find…</p>,
  }
);

export default function Page() {
  return <SemanticFindDemo />;
}
