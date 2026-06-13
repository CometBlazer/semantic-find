// ============================================================
// app/inbox/page.tsx
// ============================================================
// The /inbox route. Like the home demo, the search component is
// loaded with dynamic(..., { ssr: false }) so transformers.js
// never runs on the server — it only ever touches the browser.
//
// The inbox-specific styles live in ./inbox.css, imported here so
// they don't leak into the rest of the app.
// ============================================================

"use client";

import dynamic from "next/dynamic";
import "./inbox.css";

const EmailSearchDemo = dynamic(
  () => import("@/components/EmailSearchDemo"),
  {
    ssr: false,
    loading: () => (
      <div className="ib-boot">
        <span className="ib-spinner" /> Loading inbox search…
      </div>
    ),
  }
);

export default function InboxPage() {
  return <EmailSearchDemo />;
}