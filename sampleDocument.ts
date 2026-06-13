// ============================================================
// components/sampleDocument.ts
// ============================================================
// A long, static demo document: the (fictional) customer
// handbook for "Lumenote", a note-taking app. It deliberately
// contains sections about billing, refunds, cancellation,
// privacy and security so that natural-language queries like
// "the part about cancelling" or "privacy concerns" have real
// semantic targets — often phrased with different words than
// the query, which is exactly what plain Ctrl+F can't find.
// ============================================================

import type { Block } from "@/lib/chunk";

export const DOC_TITLE = "Lumenote Customer Handbook";

export const sampleDocument: Block[] = [
  { type: "h2", text: "Welcome to Lumenote" },
  {
    type: "p",
    text: "Lumenote is a personal knowledge workspace for people who think in fragments. Capture a thought on your phone in the queue at the bakery, expand it into an outline on your laptop that evening, and watch the app quietly link it to the three related notes you wrote last spring. This handbook covers everything from creating an account to closing one, and it is written to be read in pieces — jump to whichever section answers the question you arrived with.",
  },
  {
    type: "p",
    text: "Throughout this document, \"we\", \"us\" and \"Lumenote\" refer to Lumenote Labs Ltd., registered in Bristol, United Kingdom. \"You\" means the person or organisation holding the account. Where a section describes behaviour that differs between the free plan and the paid plans, the difference is called out explicitly rather than buried in a footnote.",
  },

  { type: "h2", text: "Creating and managing your account" },
  {
    type: "p",
    text: "You can sign up with an email address and password, or with single sign-on through Google or Apple. One account works across every device: notes written on the train sync the moment your phone finds a connection, and conflicts are resolved by keeping both versions side by side rather than silently overwriting either one.",
  },
  {
    type: "p",
    text: "Account names and avatars can be changed at any time from Settings. Changing your email address requires confirming both the old and the new address, which protects you if someone briefly gains access to one inbox but not the other. If you lose access to your email entirely, our support team can verify identity through a short recorded-device check.",
  },
  {
    type: "p",
    text: "Workspaces let one person hold several separate note collections — say, one for work and one for a novel-in-progress — under a single login. Each workspace has its own members, its own sharing rules, and its own export history, so nothing leaks between the contexts of your life unless you deliberately move it.",
  },

  { type: "h2", text: "Plans, billing and payments" },
  {
    type: "p",
    text: "The free plan includes unlimited notes on up to two devices. Lumenote Plus adds unlimited devices, version history, and offline vaults; Lumenote Teams adds shared workspaces, admin controls, and centralised invoicing. Prices are listed in your local currency on the pricing page, and the price you see at checkout is the price you pay — taxes are included where the law requires it.",
  },
  {
    type: "p",
    text: "Subscriptions are charged at the start of each billing period, monthly or yearly, to the card or PayPal account on file. If a charge fails we retry three times over ten days and email you before each attempt; your notes are never deleted because of a failed payment, the account simply drops back to the free plan until billing is fixed.",
  },
  {
    type: "p",
    text: "Invoices and receipts live under Settings → Billing, and each one can be downloaded as a PDF with your company details added. Teams customers can pay annual invoices by bank transfer in GBP, EUR or USD. We never store full card numbers on our own servers; payment details are held by our payment processor and we keep only the last four digits for display.",
  },

  { type: "h2", text: "Refunds" },
  {
    type: "p",
    text: "If Lumenote isn't working out, you can get your money back. Every first-time purchase of a paid plan carries a 30-day guarantee: tell us within 30 days of the charge and we will return the full amount, no questions asked and no form to fill in beyond a single email to billing@lumenote.app. The refund lands on the original payment method within five to ten business days, depending on your bank.",
  },
  {
    type: "p",
    text: "Renewals are treated generously too. If a yearly subscription renews and you contact us within 14 days of that renewal without having meaningfully used the paid features in the new period, we will reverse the charge in full. Outside that window we can issue a pro-rated credit at our discretion, typically when someone simply forgot to cancel. Purchases made through the Apple App Store or Google Play must be refunded through Apple or Google respectively, because those payments never reach us — we will point you to the right form if you ask.",
  },

  { type: "h2", text: "Cancelling your subscription" },
  {
    type: "p",
    text: "You can stop paying at any time, and you never need to talk to a human to do it. Open Settings → Billing → Cancel plan, confirm once, and you're done — the paid features remain active until the end of the period you have already paid for, after which the account moves to the free plan automatically. There is no cancellation fee, no retention call, and no dark-pattern maze.",
  },
  {
    type: "p",
    text: "Ending a subscription is not the same as deleting an account. After downgrading, every note you ever wrote stays exactly where it was; you just lose access to paid-only features such as version history. If you later resubscribe, version history resumes and the old versions are still there. If instead you want your data gone entirely, see the section on deleting your account and data below.",
  },

  { type: "h2", text: "Privacy and your data" },
  {
    type: "p",
    text: "Your notes belong to you, full stop. We do not read them, we do not sell them, we do not use their contents to train machine-learning models, and no advertising network ever touches them. The contents of your notes are encrypted in transit and at rest, and access by our own engineers is restricted to a break-glass procedure that is logged, audited quarterly, and used only to investigate a fault you have reported.",
  },
  {
    type: "p",
    text: "We collect a small amount of operational data: which features are used (not what you wrote with them), crash reports, and coarse device information. This telemetry can be switched off entirely under Settings → Privacy with a single toggle, and the app behaves identically with it off. We are registered with the UK Information Commissioner's Office and honour data-subject requests under UK GDPR and EU GDPR within 30 days.",
  },
  {
    type: "p",
    text: "Deleting your account erases your notes from our production systems immediately and from encrypted backups within 35 days. You can ask for a machine-readable copy of everything we hold about you — notes, metadata, billing records — before you go, and we will provide it as a single archive. A deleted account cannot be recovered, which is precisely the point.",
  },

  { type: "h2", text: "Security" },
  {
    type: "p",
    text: "Every account can enable two-factor authentication with an authenticator app or a hardware security key, and Teams admins can require it for all members. New sign-ins from an unrecognised device trigger an email alert with a one-tap \"this wasn't me\" link that locks the session. Session tokens expire after 30 days of inactivity and are revoked instantly when you change your password.",
  },
  {
    type: "p",
    text: "Offline vaults, available on paid plans, add an extra layer: notes in a vault are encrypted with a passphrase that only you know, before they ever leave your device. We cannot reset a vault passphrase, recover its contents, or hand them to anyone else, because the key never reaches our servers. Write the passphrase down somewhere safe — for vaults, \"forgot my password\" genuinely has no answer.",
  },

  { type: "h2", text: "Sharing and collaboration" },
  {
    type: "p",
    text: "Any note can be shared three ways: a read-only public link, an invite to specific email addresses, or full workspace membership. Public links can be set to expire after a date you choose, and revoking a link takes effect within seconds for anyone who has it open. Invited collaborators see edits appear live, with each person's cursor labelled, and every change is attributed in the note's history.",
  },
  {
    type: "p",
    text: "Comments live in the margin rather than inside the text, so feedback never mangles the note itself. Resolving a comment hides it from the margin but keeps it in history, which settles most \"who decided this?\" arguments months later. Guests invited to a single note never see the rest of your workspace, your other notes, or even the workspace's name.",
  },

  { type: "h2", text: "Working offline" },
  {
    type: "p",
    text: "The desktop and mobile apps keep a full local copy of your notes, so a tunnel, a flight, or a dead router costs you nothing. Edits made offline are queued and synced when a connection returns; if the same paragraph was edited in two places while disconnected, both versions are preserved and the note shows a gentle merge prompt rather than picking a winner for you.",
  },
  {
    type: "p",
    text: "Attachments behave slightly differently offline: images and PDFs you have opened recently are cached on the device, while older attachments show a placeholder until you reconnect. You can pin any note, including its attachments, to guarantee it is always available offline — handy for travel documents and the packing list you only ever need in places with no signal.",
  },

  { type: "h2", text: "Exporting and leaving" },
  {
    type: "p",
    text: "Lock-in is a bug, not a business model. At any moment you can export a single note, a folder, or an entire workspace as Markdown files with attachments in ordinary folders, as HTML, or as a JSON archive that preserves every link between notes. Exports are generated on demand and are yours to keep; there is no limit on how often you run one.",
  },
  {
    type: "p",
    text: "If you are migrating to another tool, the Markdown export is deliberately boring: standard CommonMark, front-matter for metadata, relative links between files. Several competing apps import it directly. We would rather you leave easily and remember us fondly than stay because leaving was made painful.",
  },

  { type: "h2", text: "Acceptable use" },
  {
    type: "p",
    text: "Lumenote may not be used to store or distribute malware, to harass people, to infringe copyright at scale, or to break the law of the place you are in. We act on verified reports rather than scanning private notes, in keeping with the privacy commitments above. Accounts used for abuse are warned where possible and suspended where necessary, and you can appeal any enforcement decision to a human reviewer.",
  },

  { type: "h2", text: "Getting help" },
  {
    type: "p",
    text: "Support is handled by people who use the product daily, not by a deflection bot. Email support@lumenote.app and a human replies within one business day on the free plan and within four hours on paid plans. The public changelog lists every release, the status page reports incidents in plain language, and post-mortems for any outage longer than 30 minutes are published within a week.",
  },
  {
    type: "p",
    text: "Feature requests are tracked in an open board where you can vote, and the roadmap column is honest about what \"planned\" means. When we say no to a request we say why. This handbook itself is versioned; material changes to refunds, privacy, or pricing are announced by email at least 30 days before they take effect.",
  },
];
