import { create } from 'zustand'
import { ApiProfile, Persona, RoundRecord, Achievement } from '@/core/types'
import { checkAchievements } from '@/core/achievements'
import { statsBrief } from '@/core/stats'
import { BlackjackAction, SideBetStakes, TableView } from '@/games/blackjack/types'
import { BlackjackSession, SessionEvent, generateReport } from '@/games/blackjack/session'
import {
  AppSettings, DEFAULT_SETTINGS, DEFAULT_PROFILE, LOCAL_BOT_PROFILE, PRESET_PERSONAS
} from './presets'
import { getDict, Language } from './i18n'

export interface FeedItem {
  id: number
  speakerId: string
  speakerName: string
  text: string
  kind: 'utterance' | 'log' | 'error'
  channel: 'table' | 'companion'
  round: number
}

export interface Toast {
  id: number
  text: string
  kind: 'achievement' | 'info' | 'error'
}

export interface Report {
  id: string
  timestamp: number
  text: string
}

let feedId = 0
let toastId = 0

interface AppStore {
  loaded: boolean
  settings: AppSettings
  profiles: ApiProfile[]
  personas: Persona[]
  history: RoundRecord[]
  achievements: Achievement[]
  reports: Report[]
  memories: Record<string, { note: string | null; turns: { role: string; content: string }[] }>

  session: BlackjackSession | null
  view: TableView | null
  feed: FeedItem[]
  awaiting: { legal: BlackjackAction[] } | null
  thinking: Record<string, boolean>
  oppBankrolls: Record<string, number>
  lastRecord: RoundRecord | null
  toasts: Toast[]
  busyDealing: boolean
  modal: 'settings' | 'profiles' | 'personas' | 'history' | 'achievements' | null

  init: () => Promise<void>
  t: () => ReturnType<typeof getDict>
  setModal: (m: AppStore['modal']) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  saveProfiles: (profiles: ApiProfile[]) => void
  savePersonas: (personas: Persona[]) => void
  openTable: () => void
  deal: (bet: number, sideBets: SideBetStakes) => Promise<void>
  playerAction: (a: BlackjackAction) => Promise<void>
  sendToOpponent: (personaId: string, text: string) => void
  chatWithCompanion: (personaId: string, text: string) => Promise<void>
  companionComment: (personaId: string, kind: 'banter' | 'advice') => Promise<void>
  compressMemory: (personaId: string) => Promise<void>
  newMemorySession: (personaId: string) => void
  savePlayerNote: (recordId: string, note: string) => void
  deleteRecord: (recordId: string) => void
  clearHistory: () => void
  rebuy: () => void
  resetBankroll: () => void
  makeReport: (profileId: string) => Promise<void>
  dismissToast: (id: number) => void
  pushToast: (text: string, kind: Toast['kind']) => void
}

async function persist(key: string, value: unknown): Promise<void> {
  try {
    await window.casino.store.save(key, value)
  } catch (err) {
    console.error('persist failed', key, err)
  }
}

export const useStore = create<AppStore>((set, get) => {
  function handleEvent(e: SessionEvent): void {
    const s = get()
    switch (e.type) {
      case 'view':
        set({ view: e.view })
        break
      case 'utterance':
        set({
          feed: [...s.feed, {
            id: ++feedId,
            speakerId: e.utterance.speakerId,
            speakerName: e.utterance.speakerName,
            text: e.utterance.text,
            kind: 'utterance' as const,
            channel: e.channel,
            round: e.utterance.round
          }].slice(-200)
        })
        break
      case 'awaiting-player':
        set({ awaiting: { legal: e.legal } })
        break
      case 'thinking':
        set({ thinking: { ...s.thinking, [e.personaId]: e.on } })
        break
      case 'corrected': {
        const t = s.t()
        set({
          feed: [...s.feed, {
            id: ++feedId, speakerId: 'system', speakerName: '⚖',
            text: `${e.speakerName}: ${t.chat.corrected}（${e.proposed} → ${e.action}）`,
            kind: 'log', channel: 'table', round: s.session?.roundNo ?? 0
          }]
        })
        break
      }
      case 'bankrolls':
        set({ oppBankrolls: e.opponents })
        get().updateSettings({ bankroll: e.player })
        break
      case 'rebuy':
        set({
          feed: [...s.feed, {
            id: ++feedId, speakerId: 'system', speakerName: '💷',
            text: `${e.who} re-buy £1000`, kind: 'log', channel: 'table',
            round: s.session?.roundNo ?? 0
          }]
        })
        break
      case 'log':
        set({
          feed: [...s.feed, {
            id: ++feedId, speakerId: 'system', speakerName: '🂠',
            text: e.message, kind: 'log', channel: 'table', round: s.session?.roundNo ?? 0
          }]
        })
        break
      case 'error':
        get().pushToast(`${s.t().errors.llm}: ${e.message}`, 'error')
        break
      case 'round-settled': {
        const history = [...get().history, e.record]
        const unlocked = new Set(get().achievements.map((a) => a.id))
        const fresh = checkAchievements(history, e.record, unlocked)
        const achievements = [
          ...get().achievements,
          ...fresh.map((id) => ({ id, unlockedAt: Date.now() }))
        ]
        const dict = get().t()
        for (const id of fresh) {
          const a = (dict.achievements as Record<string, { name: string; desc: string } | string>)[id]
          if (typeof a === 'object') get().pushToast(`🏆 ${a.name} — ${a.desc}`, 'achievement')
        }
        set({ history, achievements, lastRecord: e.record, awaiting: null })
        persist('history', history)
        persist('achievements', achievements)
        const session = get().session
        if (session) {
          const memories = { ...get().memories, ...session.getMemorySnapshots() }
          set({ memories })
          persist('memories', memories)
        }
        break
      }
    }
  }

  return {
    loaded: false,
    settings: DEFAULT_SETTINGS,
    profiles: [LOCAL_BOT_PROFILE, DEFAULT_PROFILE],
    personas: PRESET_PERSONAS,
    history: [],
    achievements: [],
    reports: [],
    memories: {},
    session: null,
    view: null,
    feed: [],
    awaiting: null,
    thinking: {},
    oppBankrolls: {},
    lastRecord: null,
    toasts: [],
    busyDealing: false,
    modal: null,

    t: () => getDict(get().settings.language as Language),

    init: async () => {
      const [settings, profiles, personas, history, achievements, reports, memories] =
        await Promise.all([
          window.casino.store.load('settings'),
          window.casino.store.load('profiles'),
          window.casino.store.load('personas'),
          window.casino.store.load('history'),
          window.casino.store.load('achievements'),
          window.casino.store.load('reports'),
          window.casino.store.load('memories')
        ])
      set({
        settings: settings ? { ...DEFAULT_SETTINGS, ...(settings as AppSettings) } : DEFAULT_SETTINGS,
        profiles: (profiles as ApiProfile[]) ?? [LOCAL_BOT_PROFILE, DEFAULT_PROFILE],
        personas: (personas as Persona[]) ?? PRESET_PERSONAS,
        history: (history as RoundRecord[]) ?? [],
        achievements: (achievements as Achievement[]) ?? [],
        reports: (reports as Report[]) ?? [],
        memories: (memories as AppStore['memories']) ?? {},
        loaded: true
      })
      get().openTable()
    },

    setModal: (m) => set({ modal: m }),

    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch }
      set({ settings })
      persist('settings', settings)
    },

    saveProfiles: (profiles) => {
      set({ profiles })
      persist('profiles', profiles)
    },

    savePersonas: (personas) => {
      set({ personas })
      persist('personas', personas)
    },

    openTable: () => {
      const { settings, personas, profiles, memories } = get()
      const profileOf = (p: Persona): ApiProfile =>
        profiles.find((x) => x.id === p.profileId) ?? LOCAL_BOT_PROFILE
      const byId = (id: string): Persona | undefined => personas.find((p) => p.id === id)
      const opponents = settings.opponentIds
        .map(byId)
        .filter((p): p is Persona => !!p && p.role === 'opponent')
        .slice(0, 4)
        .map((persona) => ({ persona, profile: profileOf(persona) }))
      const companions = settings.companionIds
        .map(byId)
        .filter((p): p is Persona => !!p && p.role === 'companion')
        .slice(0, 3)
        .map((persona) => ({ persona, profile: profileOf(persona) }))
      const dealerPersona = settings.dealerPersonaId ? byId(settings.dealerPersonaId) : undefined
      const session = new BlackjackSession({
        rules: settings.rules,
        playerName: settings.playerName,
        playerBankroll: settings.bankroll,
        playerSeatIndex: settings.playerSeatIndex,
        opponents,
        companions,
        dealer:
          dealerPersona && dealerPersona.role === 'dealer'
            ? { persona: dealerPersona, profile: profileOf(dealerPersona) }
            : null,
        settings: {
          tableTalk: settings.tableTalk,
          declarations: settings.declarations,
          dealerSettle: settings.dealerSettle,
          habitMemory: settings.habitMemory
        },
        onEvent: handleEvent
      })
      session.restoreMemories(memories)
      set({ session, view: null, awaiting: null, lastRecord: null, thinking: {} })
    },

    deal: async (bet, sideBets) => {
      const { session, settings } = get()
      if (!session || get().busyDealing || session.inRound) return
      const total = bet + Object.values(sideBets).reduce((a, b) => a + (b ?? 0), 0)
      if (total > settings.bankroll) {
        get().pushToast(get().t().errors.bankrupt, 'error')
        return
      }
      set({ busyDealing: true, lastRecord: null })
      try {
        await session.startRound(bet, sideBets)
      } finally {
        set({ busyDealing: false })
      }
    },

    playerAction: async (a) => {
      const { session } = get()
      if (!session) return
      set({ awaiting: null })
      await session.playerAction(a)
    },

    sendToOpponent: (personaId, text) => {
      get().session?.queueMessageToOpponent(personaId, text)
      get().pushToast(get().t().chat.queued, 'info')
    },

    chatWithCompanion: async (personaId, text) => {
      await get().session?.companionChat(personaId, text)
    },

    companionComment: async (personaId, kind) => {
      await get().session?.companionComment(personaId, kind)
    },

    compressMemory: async (personaId) => {
      const ok = await get().session?.compressMemory(personaId)
      if (ok) get().pushToast(get().t().chat.compressDone, 'info')
    },

    newMemorySession: (personaId) => {
      get().session?.newMemorySession(personaId)
      const memories = { ...get().memories }
      delete memories[personaId]
      set({ memories })
      persist('memories', memories)
    },

    savePlayerNote: (recordId, note) => {
      const history = get().history.map((r) => (r.id === recordId ? { ...r, playerNote: note } : r))
      set({ history })
      persist('history', history)
    },

    deleteRecord: (recordId) => {
      const history = get().history.filter((r) => r.id !== recordId)
      set({ history })
      persist('history', history)
    },

    clearHistory: () => {
      set({ history: [] })
      persist('history', [])
    },

    rebuy: () => {
      const rec: RoundRecord = {
        id: globalThis.crypto.randomUUID(),
        game: 'blackjack', round: 0, timestamp: Date.now(),
        playerBet: 0, playerNet: 0,
        bankrollBefore: get().settings.bankroll, bankrollAfter: 1000,
        seats: [], declarations: {}, bankrollEvent: 'rebuy'
      }
      const history = [...get().history, rec]
      set({ history })
      persist('history', history)
      get().updateSettings({ bankroll: 1000 })
      const session = get().session
      if (session) session.playerBankroll = 1000
    },

    resetBankroll: () => {
      const rec: RoundRecord = {
        id: globalThis.crypto.randomUUID(),
        game: 'blackjack', round: 0, timestamp: Date.now(),
        playerBet: 0, playerNet: 0,
        bankrollBefore: get().settings.bankroll, bankrollAfter: 1000,
        seats: [], declarations: {}, bankrollEvent: 'manual-reset'
      }
      const history = [...get().history, rec]
      set({ history })
      persist('history', history)
      get().updateSettings({ bankroll: 1000 })
      const session = get().session
      if (session) session.playerBankroll = 1000
    },

    makeReport: async (profileId) => {
      const profile = get().profiles.find((p) => p.id === profileId)
      if (!profile) return
      const res = await generateReport(profile, get().history, statsBrief(get().history))
      if (res.ok && res.text) {
        const reports = [...get().reports, {
          id: globalThis.crypto.randomUUID(), timestamp: Date.now(), text: res.text
        }]
        set({ reports })
        persist('reports', reports)
      } else {
        get().pushToast(`${get().t().errors.llm}: ${res.error}`, 'error')
      }
    },

    pushToast: (text, kind) => {
      const toast = { id: ++toastId, text, kind }
      set({ toasts: [...get().toasts, toast] })
      setTimeout(() => get().dismissToast(toast.id), kind === 'achievement' ? 6000 : 4000)
    },

    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
})
