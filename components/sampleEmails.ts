// ============================================================
// components/sampleEmails.ts
// ============================================================
// Email corpus #1 — the Lumenote world. These messages mirror
// the topics in the original handbook demo (refunds, billing,
// cancellation, privacy, security, exports) so the same example
// queries have real targets, but now spread across many senders
// and timestamps. This lets author-aware queries ("refund info
// from Bob") and the Best/Recent toggle actually do something.
//
// Shape is deliberately minimal: an id, a subject, one author
// (name + email), an ISO timestamp, a few tags, and a plain-text
// body. No reply chains yet — each email stands alone.
//
// lib/email.ts turns each of these into the same Chunk shape the
// ranker already understands, so search code is reused verbatim.
// ============================================================

export interface Email {
  id: string;
  subject: string;
  author: { name: string; email: string };
  /** ISO 8601 — drives the "Recent" sort. */
  timestamp: string;
  tags: string[];
  body: string;
}

export const LUMENOTE_INBOX_TITLE = "Lumenote — Support & Billing";

export const sampleEmails: Email[] = [
  {
    id: "lum-001",
    subject: "Re: getting my money back after the annual renewal",
    author: { name: "Bob Achebe", email: "bob.achebe@lumenote.app" },
    timestamp: "2026-05-02T09:14:00Z",
    tags: ["refunds", "billing"],
    body: "Hi there — following up on your note about the yearly plan that renewed last week. Because you reached out within 14 days of the renewal and the paid features weren't really touched in the new period, I've gone ahead and reversed the full charge. It should land back on your original card within five to ten business days depending on your bank. No form to fill in, nothing else needed from you. If anything looks off after ten days, reply here and I'll chase it.",
  },
  {
    id: "lum-002",
    subject: "30-day guarantee — yes it still applies to you",
    author: { name: "Bob Achebe", email: "bob.achebe@lumenote.app" },
    timestamp: "2026-04-18T15:40:00Z",
    tags: ["refunds"],
    body: "Good news: your first purchase of Lumenote Plus was 22 days ago, which is comfortably inside the 30-day window. That means a full refund, no questions asked. I just need a one-line confirmation that you'd like to proceed and I'll trigger it today. One caveat worth flagging — if you originally paid through the Apple App Store rather than us directly, the refund has to go through Apple, and I'll point you at the right form.",
  },
  {
    id: "lum-003",
    subject: "How do I cancel without losing my notes?",
    author: { name: "Priya Raman", email: "priya.raman@gmail.com" },
    timestamp: "2026-05-09T11:02:00Z",
    tags: ["cancellation", "data"],
    body: "I want to stop paying for the subscription but I'm nervous about what happens to everything I've written. Will my notes get deleted if I downgrade? Do I have to call someone to cancel, or is there a button? Sorry if this is covered somewhere obvious — I just don't want to lose two years of work by clicking the wrong thing.",
  },
  {
    id: "lum-004",
    subject: "Re: How do I cancel without losing my notes?",
    author: { name: "Dana Okoro", email: "dana.okoro@lumenote.app" },
    timestamp: "2026-05-09T13:25:00Z",
    tags: ["cancellation", "data"],
    body: "Totally reasonable worry, and the answer is reassuring: cancelling never deletes a single note. Go to Settings, then Billing, then Cancel plan, confirm once, and you're done — no phone call, no retention maze. Your paid features stay active until the end of the period you've already paid for, then the account quietly drops to the free plan. Every note stays exactly where it is; you only lose paid-only extras like version history, and even those come back if you resubscribe later.",
  },
  {
    id: "lum-005",
    subject: "Payment failed — am I about to lose access?",
    author: { name: "Marco Bianchi", email: "marco.b@studiobianchi.it" },
    timestamp: "2026-05-11T08:47:00Z",
    tags: ["billing"],
    body: "Got an email saying my card was declined. The card expired, my fault. Before I update it — does a failed payment wipe my notes or lock me out completely? Trying to figure out how urgent this is before I dig out the new card.",
  },
  {
    id: "lum-006",
    subject: "Re: Payment failed — am I about to lose access?",
    author: { name: "Dana Okoro", email: "dana.okoro@lumenote.app" },
    timestamp: "2026-05-11T09:30:00Z",
    tags: ["billing"],
    body: "Nothing dramatic happens, so take your time. When a charge fails we retry three times over ten days and email you before each attempt. Your notes are never deleted over a billing hiccup — the account just drops back to the free plan until the payment goes through. Update the card whenever and the paid features switch straight back on. No data is lost in between.",
  },
  {
    id: "lum-007",
    subject: "Do you train AI on the contents of my notes?",
    author: { name: "Priya Raman", email: "priya.raman@gmail.com" },
    timestamp: "2026-05-14T19:55:00Z",
    tags: ["privacy"],
    body: "Quick but important one before I commit to the paid plan. Are the things I write used to train machine-learning models? Do you read my notes, or sell them, or let ad networks see them? I keep some fairly personal material in here and I'd like to know exactly where it goes before I trust it with more.",
  },
  {
    id: "lum-008",
    subject: "Re: Do you train AI on the contents of my notes?",
    author: { name: "Dana Okoro", email: "dana.okoro@lumenote.app" },
    timestamp: "2026-05-14T21:10:00Z",
    tags: ["privacy"],
    body: "Plainly: no on every count. We don't read your notes, we don't sell them, and we never use their contents to train any model. No advertising network touches them. Content is encrypted in transit and at rest, and the only way an engineer can reach it is a logged, audited break-glass procedure used solely to investigate a fault you've reported. You can also switch off the small amount of usage telemetry we collect from Settings, Privacy — the app behaves identically with it off.",
  },
  {
    id: "lum-009",
    subject: "Need a VAT invoice with our company details",
    author: { name: "Hannah Wolff", email: "h.wolff@nordwind-gmbh.de" },
    timestamp: "2026-04-29T10:18:00Z",
    tags: ["billing", "teams"],
    body: "Our finance team needs proper invoices for the Teams subscription, with our registered company name and VAT number on them, ideally as PDFs. Also — can we pay the annual amount by bank transfer in EUR rather than card? Card payments are awkward for us to reconcile at year end.",
  },
  {
    id: "lum-010",
    subject: "Re: Need a VAT invoice with our company details",
    author: { name: "Bob Achebe", email: "bob.achebe@lumenote.app" },
    timestamp: "2026-04-29T12:05:00Z",
    tags: ["billing", "teams"],
    body: "Both are easy. Every invoice lives under Settings, Billing and downloads as a PDF with your company details added — VAT number included once you've entered it there. And yes, Teams customers can pay annual invoices by bank transfer in GBP, EUR or USD, so EUR is no problem. I'll switch your account to invoice billing now; you'll get the first one to forward to finance within the hour.",
  },
  {
    id: "lum-011",
    subject: "Lost my phone — can someone else get into my account?",
    author: { name: "Tomas Nielsen", email: "tomas.nielsen@hey.com" },
    timestamp: "2026-05-16T07:22:00Z",
    tags: ["security"],
    body: "My phone was stolen last night and I'm worried whoever has it can open Lumenote and read everything. What should I do right now? Is there a way to kick that device out, and does changing my password help? I do have two-factor turned on if that matters.",
  },
  {
    id: "lum-012",
    subject: "Re: Lost my phone — can someone else get into my account?",
    author: { name: "Dana Okoro", email: "dana.okoro@lumenote.app" },
    timestamp: "2026-05-16T08:01:00Z",
    tags: ["security"],
    body: "First, breathe — two-factor means they'd need your second factor to sign in fresh. Do this now: change your password, which instantly revokes every existing session including the one on the stolen phone. Then check the new-device alerts; any sign-in you don't recognise has a one-tap 'this wasn't me' link that locks the session. Session tokens also expire after 30 days of inactivity, but changing the password is the immediate kill switch.",
  },
  {
    id: "lum-013",
    subject: "Forgot my offline vault passphrase — help!",
    author: { name: "Aisha Bello", email: "aisha.bello@protonmail.com" },
    timestamp: "2026-05-18T14:33:00Z",
    tags: ["security", "data"],
    body: "I set up an offline vault months ago and now I can't remember the passphrase. The reset link just says it can't help. Surely support can recover it for me? There are important documents in there. Please tell me there's a way back in.",
  },
  {
    id: "lum-014",
    subject: "Re: Forgot my offline vault passphrase — help!",
    author: { name: "Dana Okoro", email: "dana.okoro@lumenote.app" },
    timestamp: "2026-05-18T16:09:00Z",
    tags: ["security", "data"],
    body: "I wish I had better news, and I want to be honest rather than give false hope. Offline vaults are encrypted with a passphrase that only ever exists on your device — the key never reaches our servers by design, which is exactly what makes them secure. That means we genuinely cannot reset it, recover the contents, or hand them to anyone. For a vault, 'forgot my password' has no answer. If you have the passphrase written down anywhere, that's the only route back in.",
  },
  {
    id: "lum-015",
    subject: "Can I take my notes to another app?",
    author: { name: "Priya Raman", email: "priya.raman@gmail.com" },
    timestamp: "2026-05-21T12:48:00Z",
    tags: ["export", "data"],
    body: "I'm evaluating a couple of other note tools and want to know how locked in I'd be. If I leave, can I take everything with me — and in a format another app can actually read, not some proprietary blob? Worried about losing the links between notes especially.",
  },
  {
    id: "lum-016",
    subject: "Re: Can I take my notes to another app?",
    author: { name: "Bob Achebe", email: "bob.achebe@lumenote.app" },
    timestamp: "2026-05-21T14:15:00Z",
    tags: ["export", "data"],
    body: "You're not locked in at all — that's deliberate. Export a single note, a folder, or the whole workspace whenever you like, as Markdown files with attachments in ordinary folders, as HTML, or as a JSON archive that preserves every link between notes. The Markdown export is intentionally boring standard CommonMark, so several competing apps import it directly. Run it as often as you want; there's no limit and the files are yours to keep.",
  },
  {
    id: "lum-017",
    subject: "Sharing a single note with a client without exposing everything",
    author: { name: "Marco Bianchi", email: "marco.b@studiobianchi.it" },
    timestamp: "2026-05-04T16:30:00Z",
    tags: ["sharing"],
    body: "I want to send one note to a client for feedback but absolutely cannot have them see the rest of my workspace or even its name. Is a share link safe for that? And can I make the link stop working after the project wraps?",
  },
  {
    id: "lum-018",
    subject: "Re: Sharing a single note with a client",
    author: { name: "Dana Okoro", email: "dana.okoro@lumenote.app" },
    timestamp: "2026-05-04T17:12:00Z",
    tags: ["sharing"],
    body: "Perfect use case for a guest invite or a public link. A guest invited to a single note never sees the rest of your workspace, your other notes, or even the workspace's name. If you'd rather use a read-only public link, you can set it to expire on a date you choose, and revoking it takes effect within seconds for anyone who has it open. Either way the client only ever sees the one note.",
  },
  {
    id: "lum-019",
    subject: "Does the app actually work on a plane with no wifi?",
    author: { name: "Tomas Nielsen", email: "tomas.nielsen@hey.com" },
    timestamp: "2026-05-23T20:40:00Z",
    tags: ["offline"],
    body: "Travelling a lot next month and half of it is on flights with no signal. Can I actually write and edit offline, and will it sync properly when I land without clobbering anything? Also wondering about attachments — will my PDFs be there or just show a broken placeholder?",
  },
  {
    id: "lum-020",
    subject: "Re: Does the app actually work on a plane with no wifi?",
    author: { name: "Dana Okoro", email: "dana.okoro@lumenote.app" },
    timestamp: "2026-05-23T22:05:00Z",
    tags: ["offline"],
    body: "Yes — the desktop and mobile apps keep a full local copy, so a flight costs you nothing. Edits queue offline and sync when you reconnect; if the same paragraph changed in two places, both versions are kept and you get a gentle merge prompt rather than a silent overwrite. For attachments, anything you've opened recently is cached, and you can pin a note plus its attachments to guarantee they're available offline — worth doing for travel documents before you board.",
  },
  {
    id: "lum-021",
    subject: "GDPR — I want a copy of everything you hold on me",
    author: { name: "Hannah Wolff", email: "h.wolff@nordwind-gmbh.de" },
    timestamp: "2026-05-25T09:05:00Z",
    tags: ["privacy", "data"],
    body: "Exercising my data-subject rights under GDPR: please send a machine-readable copy of all data you hold about me — notes, metadata, billing records, the lot. Also, how long after I delete my account does the data actually disappear from your backups? Need this for our own compliance records.",
  },
  {
    id: "lum-022",
    subject: "Re: GDPR — I want a copy of everything you hold on me",
    author: { name: "Dana Okoro", email: "dana.okoro@lumenote.app" },
    timestamp: "2026-05-25T11:20:00Z",
    tags: ["privacy", "data"],
    body: "Happy to help — we're registered with the UK ICO and honour data-subject requests under UK and EU GDPR within 30 days. You can request a single archive of everything we hold: notes, metadata, billing records. On deletion: your notes leave production systems immediately and are gone from encrypted backups within 35 days. A deleted account can't be recovered, which is rather the point. I'll start the export now and email you the archive link.",
  },
  {
    id: "lum-023",
    subject: "Two-factor for the whole team — can I force it?",
    author: { name: "Hannah Wolff", email: "h.wolff@nordwind-gmbh.de" },
    timestamp: "2026-05-06T13:50:00Z",
    tags: ["security", "teams"],
    body: "As the Teams admin I'd like every member to be required to use two-factor authentication, not just offered it. Is that enforceable centrally, and do hardware security keys work or is it authenticator-app only? Some of our people are a bit lax about this.",
  },
  {
    id: "lum-024",
    subject: "Re: Two-factor for the whole team — can I force it?",
    author: { name: "Bob Achebe", email: "bob.achebe@lumenote.app" },
    timestamp: "2026-05-06T15:22:00Z",
    tags: ["security", "teams"],
    body: "Yes to both. Teams admins can require two-factor for all members from the admin controls, so it's not optional for anyone on the workspace. And members can choose either an authenticator app or a hardware security key — keys are fully supported and honestly the stronger option, so encourage the lax folks toward those. I can walk you through the admin toggle on a quick call if useful.",
  },
  {
    id: "lum-025",
    subject: "When are the price changes you mentioned taking effect?",
    author: { name: "Marco Bianchi", email: "marco.b@studiobianchi.it" },
    timestamp: "2026-05-27T10:33:00Z",
    tags: ["billing", "pricing"],
    body: "I saw a note that pricing might change. When does that actually happen, and will I get warning before my card is charged a different amount? Want to budget for it and not be surprised at the next renewal.",
  },
];