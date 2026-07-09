/**
 * Email model + provider seam.
 *
 * The UI talks to an EmailProvider, not to any specific backend. Today the
 * MockEmailProvider serves a realistic sample mailbox in-memory; later a real
 * provider (Gmail IMAP/API or Microsoft Graph, implemented in the main process)
 * can satisfy the same interface and the UI won't change.
 */

export type Folder = 'inbox' | 'sent' | 'archive' | 'trash'

export interface EmailAddress {
  name: string
  email: string
}

export interface EmailMessage {
  id: string
  from: EmailAddress
  to: string
  subject: string
  body: string
  preview: string
  date: number
  read: boolean
  starred: boolean
  folder: Folder
}

export interface Draft {
  to: string
  subject: string
  body: string
}

export interface EmailProvider {
  /** Address the inbox is connected as. */
  account(): string
  list(): EmailMessage[]
  send(draft: Draft): EmailMessage
}

const ACCOUNT = 'consult@acintelligence.net'

function ago(mins: number): number {
  return Date.now() - mins * 60_000
}

/** Realistic seed mail for a web-building / AI studio inbox. */
export function seedMessages(): EmailMessage[] {
  const m = (
    id: string,
    name: string,
    email: string,
    subject: string,
    preview: string,
    body: string,
    minutesAgo: number,
    extra: Partial<EmailMessage> = {}
  ): EmailMessage => ({
    id,
    from: { name, email },
    to: ACCOUNT,
    subject,
    preview,
    body,
    date: ago(minutesAgo),
    read: false,
    starred: false,
    folder: 'inbox',
    ...extra
  })

  return [
    m(
      'e1',
      'GitHub',
      'notifications@github.com',
      '[kaidena9/parallax-web-design] PR #4 ready for review',
      'Your pull request "Add scroll-scrub frame loader" has passed all checks and is ready to merge.',
      'Hi Kaiden,\n\nYour pull request #4 "Add scroll-scrub frame loader" in kaidena9/parallax-web-design has passed all checks (build ✓, lint ✓) and is ready for review.\n\nReview it: https://github.com/kaidena9/parallax-web-design/pull/4\n\n— GitHub',
      14,
      { starred: true }
    ),
    m(
      'e2',
      'Vercel',
      'no-reply@vercel.com',
      'Deployment ready — nexoria',
      'nexoria.vercel.app is live. Build completed in 38s with no errors.',
      'Deployment Successful 🎉\n\nProject: nexoria\nURL: https://nexoria.vercel.app\nBuild time: 38s\nCommit: "polish hero spacing"\n\nView deployment dashboard for logs and analytics.',
      52
    ),
    m(
      'e3',
      'Dana Whitfield',
      'dana@dvacontracting.com',
      "Homepage copy — couple of tweaks",
      "Hey! The new site looks fantastic. Two small things on the homepage before we go live…",
      "Hey Kaiden,\n\nThe new site looks fantastic — the team is thrilled. Two small things on the homepage before we go live:\n\n1. Can the hero headline say \"Building Since 1998\" instead of 2001?\n2. The contact form should send to office@dvacontracting.com.\n\nNo rush, end of week is fine. Thanks again!\n\nDana",
      120,
      { starred: true }
    ),
    m(
      'e4',
      'Anthropic',
      'news@anthropic.com',
      'Claude Opus 4.8 is available in Claude Code',
      'The latest Opus model brings faster output and improved tool use to your terminal workflow.',
      'Claude Opus 4.8 is now available in Claude Code, with faster output (Fast mode) and stronger agentic tool use.\n\nUpdate your CLI to try it. Read the release notes for details.',
      210
    ),
    m(
      'e5',
      'Real Estate Test',
      'leads@realestate-test-site.com',
      'New lead from your contact form',
      'A visitor submitted the contact form: "Interested in a listing walkthrough this weekend."',
      'New form submission\n\nName: Marcus Reed\nEmail: marcus.reed@example.com\nMessage: "Interested in a listing walkthrough this weekend — are you available Saturday?"\n\nReply directly to follow up.',
      300
    ),
    m(
      'e6',
      'Stripe',
      'receipts@stripe.com',
      'Your payout of $1,840.00 is on the way',
      'A payout of $1,840.00 USD was initiated to your bank account ending in 4421.',
      'Payout initiated\n\nAmount: $1,840.00 USD\nBank: ••••4421\nExpected: 1–2 business days\n\nView the payout breakdown in your Stripe dashboard.',
      540,
      { read: true }
    ),
    m(
      'e7',
      'Figma',
      'updates@figma.com',
      'Tomas commented on "AC Intelligence — Brand"',
      '"Love the new mark — can we try the accent one notch darker?"',
      'Tomas left a comment on the file "AC Intelligence — Brand":\n\n"Love the new mark — can we try the accent one notch darker? Otherwise ship it."\n\nOpen the file to reply.',
      900,
      { read: true }
    ),
    m(
      'e8',
      'house-website CI',
      'ci@github.com',
      'Build failed — house-website',
      'The latest push to main failed: "Module not found: ./styles/theme".',
      "Build failed on house-website (main)\n\nError: Module not found: ./styles/theme\n  at src/App.tsx:3\n\nCheck the import path and re-run the workflow.",
      1500,
      { read: true }
    ),
    m(
      'e9',
      'Frankie Campbell',
      'frankie.campbell.chicago@gmail.com',
      'Split the Chicago list before we start dialing',
      'Hey — I took the top of the sheet, can you start from the barbershops down? Also call me after 3.',
      "Hey Kaiden,\n\nI took the top of the cold-call sheet — can you start from the barbershops down so we don't double-dial anyone?\n\nAlso, give me a call after 3 and we'll go over the pitch for the salons.\n\n— Frankie",
      35
    ),
    m(
      'e10',
      'AC Intelligence Website',
      'leads@acintelligence.net',
      'New lead from your contact form',
      'A new inquiry came in through the website: "Do you build sites for barbershops? Give me a call."',
      "New website form submission\n\nName: Miguel Torres\nBusiness: Torres Fresh Cuts\nPhone: (773) 555-0148\nEmail: torresfreshcuts@gmail.com\nMessage: \"Do you build websites for barbershops? A few guys recommended you. Give me a call.\"\n\nSubmitted via the contact form on acintelligence.net.",
      70
    ),
    m(
      'e11',
      'Rosa — Delara\'s Salon',
      'delarassalon@gmail.com',
      'Re: A website preview for Delara\'s',
      "Hi Kaiden — yes we'd love to see it! We've been meaning to get a real website. When can you call?",
      "Hi Kaiden,\n\nThanks for reaching out — yes, we'd love to see the preview! We've been meaning to get a real website for a while but never had the time.\n\nWhen's a good time for you to call? Mornings before 11 are best for us.\n\nThank you,\nRosa\nDelara's Salon",
      95
    )
  ]
}

export class MockEmailProvider implements EmailProvider {
  private msgs: EmailMessage[]
  constructor(seed: EmailMessage[]) {
    this.msgs = seed
  }
  account(): string {
    return ACCOUNT
  }
  list(): EmailMessage[] {
    return this.msgs
  }
  send(draft: Draft): EmailMessage {
    return {
      id: `sent-${this.msgs.length + 1}-${draft.subject.slice(0, 6)}`,
      from: { name: 'AC Intelligence', email: ACCOUNT },
      to: draft.to,
      subject: draft.subject || '(no subject)',
      body: draft.body,
      preview: draft.body.slice(0, 120),
      date: Date.now(),
      read: true,
      starred: false,
      folder: 'sent'
    }
  }
}
