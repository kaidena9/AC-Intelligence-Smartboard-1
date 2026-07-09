/**
 * Cold-outreach email templates for AC Intelligence — the four Kaiden asked for:
 * website preview, meeting plan, follow-up call, and info + number.
 *
 * Sender details live in localStorage ('wc-email-vars') so they're editable without a
 * rebuild; [bracketed] tokens are per-business blanks Kaiden fills before sending.
 */

export interface TemplateVars {
  senderName: string
  company: string
  phone: string
  calendarLink: string
  fromEmail: string
}

const K_VARS = 'wc-email-vars'
export const DEFAULT_VARS: TemplateVars = {
  senderName: 'Kaiden Amaro',
  company: 'AC Intelligence',
  phone: '[your phone]',          // set in Inbox → Signature
  calendarLink: '[your booking link]',
  fromEmail: 'consult@acintelligence.net'
}
export function loadVars(): TemplateVars {
  try { return { ...DEFAULT_VARS, ...JSON.parse(localStorage.getItem(K_VARS) || '{}') } } catch { return DEFAULT_VARS }
}
export function saveVars(v: TemplateVars): void {
  try { localStorage.setItem(K_VARS, JSON.stringify(v)) } catch { /* */ }
}

export interface EmailTemplate {
  id: string
  label: string
  desc: string
  build: (v: TemplateVars) => { subject: string; body: string }
}

const sig = (v: TemplateVars): string => `${v.senderName}\n${v.company} · ${v.phone}`

export const TEMPLATES: EmailTemplate[] = [
  {
    id: 'website',
    label: 'Website preview',
    desc: 'Show them a site URL you built',
    build: (v) => ({
      subject: 'A website preview for [Business Name]',
      body:
        `Hi [Name],\n\n` +
        `I'm ${v.senderName} with ${v.company} — we help local businesses get a professional website without the hassle. I put together a quick preview for [Business Name]:\n\n` +
        `[paste the website link here]\n\n` +
        `Free to look, and nothing goes live until you say so. If you like the direction, we can have you fully online — mobile-friendly and showing up on Google — fast.\n\n` +
        `Worth a quick look?\n\n${sig(v)}`
    })
  },
  {
    id: 'meeting',
    label: 'Meeting plan',
    desc: 'Propose a short intro call',
    build: (v) => ({
      subject: "15 minutes to map out [Business Name]'s online setup?",
      body:
        `Hi [Name],\n\n` +
        `${v.senderName} here with ${v.company}. We help businesses like [Business Name] get a clean website and get found on Google — usually in under two weeks.\n\n` +
        `I'd love to walk you through a simple plan built around your business. Quick 15 minutes, no pressure.\n\n` +
        `Grab a time that works: ${v.calendarLink}\n` +
        `Or just reply with a couple of times and I'll make it work.\n\n` +
        `Talk soon,\n${sig(v)}`
    })
  },
  {
    id: 'followup',
    label: 'Follow-up call',
    desc: 'Recap after you spoke',
    build: (v) => ({
      subject: `Following up — ${v.company}`,
      body:
        `Hi [Name],\n\n` +
        `Great talking with you today about getting [Business Name] online. As promised, a quick recap of what we covered:\n\n` +
        `• [point 1]\n` +
        `• [point 2]\n\n` +
        `Next step: [next step].\n\n` +
        `If anything comes up before then, call or text me at ${v.phone}.\n\n` +
        `Thanks again,\n${sig(v)}`
    })
  },
  {
    id: 'info',
    label: 'What we do + call us',
    desc: 'Intro to AC Intelligence with your number',
    build: (v) => ({
      subject: 'Helping [Business Name] get found online',
      body:
        `Hi [Name],\n\n` +
        `I'm ${v.senderName} with ${v.company}. We build professional websites and set up Google presence for local businesses — so when someone searches for what you do, they find you first and can call or book in one tap.\n\n` +
        `A few things we handle:\n` +
        `• A clean, mobile-friendly website\n` +
        `• Getting you on Google Maps & Search\n` +
        `• A click-to-call button so customers reach you instantly\n\n` +
        `If it sounds useful, I'd love to chat — call or text me anytime at ${v.phone}, or just reply here.\n\n${sig(v)}`
    })
  }
]
