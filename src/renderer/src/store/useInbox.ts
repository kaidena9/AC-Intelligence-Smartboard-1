import { create } from 'zustand'
import { seedMessages, type Draft, type EmailMessage, type Folder } from '../lib/email'
import { fetchMail, sendMail, markMail, moveMail } from '../lib/mailBridge'

interface InboxState {
  account: string
  messages: EmailMessage[]
  folder: Folder
  selectedId: string | null
  composeOpen: boolean
  composeError: string | null
  live: boolean // true = real consult@ inbox via the bridge; false = demo mailbox
  loading: boolean

  load: () => Promise<void>
  setFolder: (f: Folder) => void
  select: (id: string | null) => void
  markRead: (id: string, read: boolean) => void
  toggleStar: (id: string) => void
  archive: (id: string) => void
  trash: (id: string) => void
  restore: (id: string) => void
  openCompose: () => void
  closeCompose: () => void
  send: (draft: Draft) => Promise<void>
}

export const useInbox = create<InboxState>((set, get) => ({
  account: 'consult@acintelligence.net',
  messages: [],
  folder: 'inbox',
  selectedId: null,
  composeOpen: false,
  composeError: null,
  live: false,
  loading: true,

  load: async () => {
    set({ loading: true })
    const r = await fetchMail()
    if (r && r.messages.length) {
      set({ messages: r.messages, account: r.account || get().account, live: true, loading: false })
    } else {
      // Bridge down or mail not configured → demo mailbox so the UI still works.
      set({ messages: seedMessages(), live: false, loading: false })
    }
  },

  setFolder: (folder) => set({ folder, selectedId: null }),

  // Selecting marks read (locally + on the server when live).
  select: (id) =>
    set((s) => {
      if (id) {
        const m = s.messages.find((x) => x.id === id)
        if (m && !m.read && s.live) markMail(id, { read: true })
      }
      return { selectedId: id, messages: id ? s.messages.map((m) => (m.id === id ? { ...m, read: true } : m)) : s.messages }
    }),

  markRead: (id, read) => {
    if (get().live) markMail(id, { read })
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, read } : m)) }))
  },

  toggleStar: (id) =>
    set((s) => {
      const m = s.messages.find((x) => x.id === id)
      if (m && s.live) markMail(id, { starred: !m.starred })
      return { messages: s.messages.map((x) => (x.id === id ? { ...x, starred: !x.starred } : x)) }
    }),

  archive: (id) => {
    if (get().live) moveMail(id, 'archive')
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, folder: 'archive' as Folder } : m)), selectedId: s.selectedId === id ? null : s.selectedId }))
  },

  trash: (id) => {
    if (get().live) moveMail(id, 'trash')
    set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, folder: 'trash' as Folder } : m)), selectedId: s.selectedId === id ? null : s.selectedId }))
  },

  restore: (id) => set((s) => ({ messages: s.messages.map((m) => (m.id === id ? { ...m, folder: 'inbox' as Folder } : m)) })),

  openCompose: () => set({ composeOpen: true, composeError: null }),
  closeCompose: () => set({ composeOpen: false, composeError: null }),

  send: async (draft) => {
    if (get().live) {
      const r = await sendMail(draft)
      if (!r.ok) { set({ composeError: r.error || 'Send failed — check the connection.' }); return }
    }
    // Reflect the sent message locally (Gmail keeps the real copy in Sent).
    const account = get().account
    const sent: EmailMessage = {
      id: `sent-${Date.now()}`, from: { name: 'AC Intelligence', email: account }, to: draft.to,
      subject: draft.subject || '(no subject)', body: draft.body, preview: draft.body.replace(/\s+/g, ' ').slice(0, 140),
      date: Date.now(), read: true, starred: false, folder: 'sent'
    }
    set((s) => ({ messages: [sent, ...s.messages], composeOpen: false, composeError: null, folder: 'sent', selectedId: sent.id }))
  }
}))
