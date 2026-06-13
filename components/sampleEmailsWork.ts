// ============================================================
// components/sampleEmailsWork.ts
// ============================================================
// Email corpus #2 — a generic work inbox, completely separate
// from the Lumenote support world. This is a small startup's
// internal + external mail: project updates, vendor threads, HR,
// scheduling, a security scare, an expense question. Topics and
// senders are varied on purpose so you can feel the difference
// between "Best" (relevance) and "Recent" (newest-first) sorting,
// and so author-aware queries like "deploy notes from Sam" bite.
//
// Same Email shape as sampleEmails.ts — swap which array you feed
// EmailSearchDemo to switch corpora; nothing else changes.
// ============================================================

import type { Email } from "./sampleEmails";

export const WORK_INBOX_TITLE = "Northwind — Team Inbox";

export const sampleEmailsWork: Email[] = [
  {
    id: "wrk-001",
    subject: "Prod deploy went out — release notes inside",
    author: { name: "Sam Whitfield", email: "sam@northwind.dev" },
    timestamp: "2026-06-11T17:42:00Z",
    tags: ["engineering", "deploy"],
    body: "v3.4 is live in production as of 5pm. Highlights: the new bulk-import endpoint, a fix for the timezone bug that was shifting scheduled posts by an hour, and the long-awaited dark mode. Rollback plan is the usual one-command revert if anything smells wrong overnight. I'll keep an eye on error rates for the next couple of hours. Shout if you see anything weird on your end.",
  },
  {
    id: "wrk-002",
    subject: "Re: invoice for the May design contract",
    author: { name: "Lena Frost", email: "lena@frost-studio.com" },
    timestamp: "2026-06-03T10:15:00Z",
    tags: ["finance", "vendor"],
    body: "Attaching the invoice for May's design work — the onboarding illustrations and the two landing pages. Total is the agreed day rate times eleven days. Payment terms are net 30 as per the contract. Let me know if your finance team needs it reformatted or split across cost centres; happy to redo it. Looking forward to starting the June sprint.",
  },
  {
    id: "wrk-003",
    subject: "Suspicious login alert on the shared analytics account",
    author: { name: "Sam Whitfield", email: "sam@northwind.dev" },
    timestamp: "2026-06-12T08:03:00Z",
    tags: ["security", "urgent"],
    body: "Heads up — got an alert about a sign-in to the shared analytics account from an IP in a country none of us are in. I've already rotated the password and revoked active sessions as a precaution. Can everyone confirm it wasn't them travelling with a VPN? If we can't account for it, we should treat it as a breach and rotate everything else that account had access to. Please reply even if it wasn't you.",
  },
  {
    id: "wrk-004",
    subject: "Offsite dates — please vote by Friday",
    author: { name: "Priya Raman", email: "priya@northwind.dev" },
    timestamp: "2026-06-09T14:20:00Z",
    tags: ["hr", "scheduling"],
    body: "We're locking in the autumn team offsite and need everyone's availability. Three candidate weeks are in the poll — mid-September, early October, late October. Please rank them by Friday so I can book the venue before they fill up. If you have a hard conflict (weddings, surgery, that sort of thing) flag it directly and I'll work around it. Location is likely the coast again unless there's an uprising.",
  },
  {
    id: "wrk-005",
    subject: "Can I expense the conference ticket?",
    author: { name: "Diego Alvarez", email: "diego@northwind.dev" },
    timestamp: "2026-06-05T11:48:00Z",
    tags: ["finance", "hr"],
    body: "There's a frontend conference in Lisbon in September that's genuinely relevant to the work I'm doing on the new editor. Ticket is on the pricier side but there's an early-bird rate ending next week. Is this something the learning budget covers, and if so what's the process — do I book and claim, or does someone book it centrally? Happy to write up takeaways afterwards.",
  },
  {
    id: "wrk-006",
    subject: "Re: Can I expense the conference ticket?",
    author: { name: "Priya Raman", email: "priya@northwind.dev" },
    timestamp: "2026-06-05T13:02:00Z",
    tags: ["finance", "hr"],
    body: "Yes, that's exactly what the learning budget is for. Grab the early-bird rate so we don't waste money — book it yourself, then submit the receipt through the expenses tool with 'L&D' as the category and it'll route to me for approval. Travel and a couple of nights' accommodation are covered too within reason; check the per-night cap in the handbook before booking a palace. Takeaways write-up very welcome.",
  },
  {
    id: "wrk-007",
    subject: "Database migration this weekend — heads up on downtime",
    author: { name: "Sam Whitfield", email: "sam@northwind.dev" },
    timestamp: "2026-06-10T16:30:00Z",
    tags: ["engineering", "deploy"],
    body: "Planning the Postgres upgrade for Saturday 2am, which is our lowest-traffic window. Expected downtime is fifteen to thirty minutes, mostly the failover. I'll put the status page into maintenance mode and post updates there. No action needed from anyone, but if you've got a long-running job scheduled overnight, pause it so it doesn't die mid-migration and confuse us both at 3am.",
  },
  {
    id: "wrk-008",
    subject: "New designer starts Monday — accounts please",
    author: { name: "Priya Raman", email: "priya@northwind.dev" },
    timestamp: "2026-06-08T09:30:00Z",
    tags: ["hr", "onboarding"],
    body: "Maya joins us Monday as our second product designer. Can IT set up her email, Figma seat, and repo access before then? Sam, she'll need read access to the design-system repo at minimum. I'll handle the laptop and the welcome lunch. Let's not repeat the last onboarding where someone spent their first morning unable to log into anything.",
  },
  {
    id: "wrk-009",
    subject: "Customer churn is up — can we dig into why?",
    author: { name: "Diego Alvarez", email: "diego@northwind.dev" },
    timestamp: "2026-06-07T15:55:00Z",
    tags: ["product", "analytics"],
    body: "The churn number ticked up two points last month and I'd like to understand it before it becomes a trend. My hunch is the onboarding flow — a lot of accounts go quiet within the first week and never come back. Could we pull the cohort data and maybe run a few exit surveys? If it is onboarding, the new editor work might actually help, but I don't want to assume.",
  },
  {
    id: "wrk-010",
    subject: "Re: Customer churn is up — can we dig into why?",
    author: { name: "Sam Whitfield", email: "sam@northwind.dev" },
    timestamp: "2026-06-07T17:20:00Z",
    tags: ["product", "analytics"],
    body: "I pulled the first-week cohorts and your hunch looks right — the drop-off clusters hard around the third step of onboarding, where people hit the empty workspace and bounce. Exit surveys are a good shout; I'll wire up a one-question prompt on cancellation. Worth pairing with the new editor launch so we're fixing the cause, not just measuring the symptom.",
  },
  {
    id: "wrk-011",
    subject: "Brand refresh — first concepts to react to",
    author: { name: "Lena Frost", email: "lena@frost-studio.com" },
    timestamp: "2026-06-04T12:10:00Z",
    tags: ["design", "vendor"],
    body: "First pass at the brand refresh is ready for your reactions. I've gone in three directions: one warm and editorial, one stark and technical, one playful with a custom wordmark. Deliberately pushed each further than the final will go so we can find the edges. Have a look and tell me which one makes you flinch in a good way. Not precious about any of them — this is the divergent stage.",
  },
  {
    id: "wrk-012",
    subject: "Reminder: submit your expenses before month end",
    author: { name: "Otto Lindqvist", email: "otto@northwind.dev" },
    timestamp: "2026-06-02T08:00:00Z",
    tags: ["finance"],
    body: "Gentle nudge from your friendly finance person: anything you want reimbursed this month needs to be in the expenses tool by the 28th, with a receipt attached. After that it rolls to next month and you'll have forgotten what the £40 at a hardware shop was even for. Mileage claims need the start and end postcodes this time — the tax people asked nicely.",
  },
  {
    id: "wrk-013",
    subject: "API rate limits are biting a big customer",
    author: { name: "Diego Alvarez", email: "diego@northwind.dev" },
    timestamp: "2026-06-12T10:25:00Z",
    tags: ["engineering", "support"],
    body: "Greenfield Co just emailed — they're hitting our API rate limit during their nightly sync and jobs are failing. They're one of our larger accounts so I don't want to leave them stuck. Can we bump their limit, or better, point them at the bulk endpoint Sam shipped yesterday? Might be the perfect first real user for it. Flagging as semi-urgent since their sync runs again tonight.",
  },
  {
    id: "wrk-014",
    subject: "Re: API rate limits are biting a big customer",
    author: { name: "Sam Whitfield", email: "sam@northwind.dev" },
    timestamp: "2026-06-12T10:51:00Z",
    tags: ["engineering", "support"],
    body: "Bumped Greenfield's rate limit for now as a stopgap, but you're right that the bulk-import endpoint is the real fix — one call instead of thousands. I'll send their engineer the docs and a sample payload. If they switch over, tonight's sync should finish in seconds instead of timing out. Let's check in tomorrow morning to confirm it actually held up under their real volume.",
  },
  {
    id: "wrk-015",
    subject: "Quarterly board deck — need your numbers by Wednesday",
    author: { name: "Otto Lindqvist", email: "otto@northwind.dev" },
    timestamp: "2026-06-06T16:45:00Z",
    tags: ["finance", "leadership"],
    body: "Building the board deck for next week. I need the headline metrics from each of you by Wednesday: Diego, product activation and churn; Sam, uptime and incident count; Priya, headcount and the hiring pipeline. Keep it to the single number that matters plus one line of context — the board doesn't want the spreadsheet, they want the story. I'll assemble and circulate a draft Thursday for sanity checks.",
  },
  {
    id: "wrk-016",
    subject: "Office plants are dying, sending help",
    author: { name: "Maya Chen", email: "maya@northwind.dev" },
    timestamp: "2026-06-12T13:15:00Z",
    tags: ["office"],
    body: "Hi all, new designer here — already overstepping by noticing the office plants are in visible distress. The big one by the window is more brown than green. I will adopt them if no one objects and nurse them back to health, but I need to know if there's a watering rota I'm about to violate or a person whose pride is tied to that fern. Excited to start properly on Monday.",
  },
  {
    id: "wrk-017",
    subject: "Postmortem: the Tuesday outage",
    author: { name: "Sam Whitfield", email: "sam@northwind.dev" },
    timestamp: "2026-06-05T18:30:00Z",
    tags: ["engineering", "incident"],
    body: "Writing up Tuesday's 40-minute outage while it's fresh. Root cause was a config change that pointed the cache at the wrong region, so every request fell through to the database and it buckled under the load. We caught it fast but the fix took longer than it should because the rollback wasn't obvious. Action items: region in the config gets a validation check, and rollback steps go in the runbook. No blame — the process let the mistake through, not the person.",
  },
  {
    id: "wrk-018",
    subject: "Can we talk about my role and growth?",
    author: { name: "Diego Alvarez", email: "diego@northwind.dev" },
    timestamp: "2026-06-09T19:40:00Z",
    tags: ["hr", "career"],
    body: "Could we grab thirty minutes sometime this week, just the two of us? Nothing alarming — I want to talk about where I'm heading. I've been doing a lot of product-shaped work alongside the engineering and I'd like to make that official rather than accidental. Would also like to understand what the path to lead looks like here. No rush on the day, whenever suits.",
  },
  {
    id: "wrk-019",
    subject: "Renewing the design tools subscription?",
    author: { name: "Otto Lindqvist", email: "otto@northwind.dev" },
    timestamp: "2026-06-01T09:20:00Z",
    tags: ["finance", "vendor"],
    body: "The annual design-software subscription auto-renews in two weeks at a chunky rate. Before it does — are we definitely still using all the seats? I count three but we're paying for five. If two are dead we should drop them now and save the money rather than discover it next year. Lena, are any of those seats yours under our account or do you bill separately?",
  },
  {
    id: "wrk-020",
    subject: "Dark mode feedback — a few rough edges",
    author: { name: "Maya Chen", email: "maya@northwind.dev" },
    timestamp: "2026-06-12T16:50:00Z",
    tags: ["design", "product"],
    body: "Tried the new dark mode that shipped today — lovely overall, but a few contrast issues worth a quick fix. The secondary text on cards is too dim to read comfortably, the focus rings vanish entirely against the dark background, and one error state is still using the light-mode red which glows alarmingly. I'll drop exact tokens in the design channel. None of it's a blocker, just polish before we shout about the feature.",
  },
];