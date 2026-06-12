import { create } from 'zustand'
import {
  ApiProfile, Persona, RoundRecord, Achievement, Match, ChatMessage, ModelRef
} from '@/core/types'
import { checkAchievements } from '@/core/achievements'
import { statsBrief, characterRecordsBrief } from '@/core/stats'
import { migrateProfile, migratePersona } from '@/core/migrate'
import { callModel, resolveModelRef } from '@/core/aiClient'
import { unwrapSpeech } from '@/core/json'
import { ShoeSnapshot } from '@/core/shoe'
import { BlackjackAction, SideBetStakes, TableView } from '@/games/blackjack/types'
import {
  BlackjackSession, SessionEvent, generateReport, buildAnalystSystem
} from '@/games/blackjack/session'
import {
  AppSettings, DEFAULT_SETTINGS, DEFAULT_PROFILE, LOCAL_BOT_PROFILE, PRESET_PERSONAS,
  migrateSettings
} from './presets'
import { getDict, Language } from './i18n'
import { enqueueSpeech } from './audio'

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

export interface AnalystState {
  open: boolean
  targetId: string // personaId 或 'player'
  targetName: string
  messages: ChatMessage[] // 不含 system
  system: string
  busy: boolean
  modelRef: ModelRef
}

let feedId = 0
let toastId = 0

type Modal =
  | 'settings' | 'profiles' | 'personas' | 'history' | 'achievements'
  | 'bgm' | 'tts' | null

interface AppStore {
  loaded: boolean
  screen: 'lobby' | 'table'
  settings: AppSettings
  profiles: ApiProfile[]
  personas: Persona[]
  history: RoundRecord[]
  matches: Match[]
  achievements: Achievement[]
  reports: Report[]
  memories: Record<string, { note: string | null; turns: { role: string; content: string }[] }>
  shoeSnapshot: ShoeSnapshot | null

  session: BlackjackSession | null
  view: TableView | null
  feed: FeedItem[]
  awaiting: { legal: BlackjackAction[] } | null
  thinking: Record<string, boolean>
  stepPending: { personaId: string; personaName: string; what: string } | null
  oppBankrolls: Record<string, number>
  lastRecord: RoundRecord | null
  toasts: Toast[]
  busyDealing: boolean
  modal: Modal
  analyst: AnalystState | null
  /** 渐进发牌动画的触发计数 */
  dealTick: number

  init: () => Promise<void>
  t: () => ReturnType<typeof getDict>
  setModal: (m: Modal) => void
  updateSettings: (patch: Partial<AppSettings>) => void
  saveProfiles: (profiles: ApiProfile[]) => void
  savePersonas: (personas: Persona[]) => void
  getProfile: (id: string) => ApiProfile | undefined

  enterTable: (mode: 'continue' | 'new', matchName?: string) => void
  backToLobby: () => void
  renameMatch: (id: string, name: string) => void
  currentMatch: () => Match | null
  newShoe: () => void

  deal: (bet: number, sideBets: SideBetStakes) => Promise<void>
  playerAction: (a: BlackjackAction) => Promise<void>
  continueStep: () => void
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
  makeReport: (ref: ModelRef) => Promise<void>
  openAnalysis: (targetId: string, targetName: string, ref: ModelRef) => Promise<void>
  askAnalyst: (text: string) => Promise<void>
  closeAnalysis: () => void
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

function autoMatchName(n: number): string {
  const d = new Date()
  return `第${n}场 · ${d.getMonth() + 1}月${d.getDate()}日`
}

export const useStore = create<AppStore>((set, get) => {
  function speakUtterance(personaId: string, text: string): void {
    const s = get()
    if (!s.settings.audio.ttsEnabled) return
    const persona = s.personas.find((p) => p.id === personaId)
    if (!persona) return
    enqueueSpeech(persona, text, {
      volume: s.settings.audio.ttsVolume,
      neuralModel: s.settings.audio.neuralModel,
      preferredEngine: s.settings.audio.preferredEngine ?? 'neural',
      getProfile: s.getProfile
    })
  }

  function handleEvent(e: SessionEvent): void {
    const s = get()
    switch (e.type) {
      case 'view':
        set({ view: e.view, dealTick: s.dealTick + 1 })
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
        if (e.utterance.speakerId !== 'player') speakUtterance(e.utterance.speakerId, e.utterance.text)
        break
      case 'awaiting-player':
        set({ awaiting: { legal: e.legal }, stepPending: null })
        break
      case 'thinking':
        set({ thinking: { ...s.thinking, [e.personaId]: e.on } })
        break
      case 'step':
        set({ stepPending: { personaId: e.personaId, personaName: e.personaName, what: e.what } })
        break
      case 'backup-used':
        set({
          feed: [...s.feed, {
            id: ++feedId, speakerId: 'system', speakerName: '🔁',
            text: `${e.personaName} 切换备用模型 ${e.model}`, kind: 'log' as const,
            channel: 'table' as const, round: s.session?.roundNo ?? 0
          }]
        })
        break
      case 'corrected': {
        const t = s.t()
        set({
          feed: [...s.feed, {
            id: ++feedId, speakerId: 'system', speakerName: '⚖',
            text: `${e.speakerName}: ${t.chat.corrected}（${e.proposed} → ${e.action}）`,
            kind: 'log' as const, channel: 'table' as const, round: s.session?.roundNo ?? 0
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
            text: `${e.who} re-buy £1000`, kind: 'log' as const, channel: 'table' as const,
            round: s.session?.roundNo ?? 0
          }]
        })
        break
      case 'log':
        set({
          feed: [...s.feed, {
            id: ++feedId, speakerId: 'system', speakerName: '🂠',
            text: e.message, kind: 'log' as const, channel: 'table' as const,
            round: s.session?.roundNo ?? 0
          }]
        })
        break
      case 'error':
        get().pushToast(`${s.t().errors.llm}: ${e.message}`, 'error')
        break
      case 'round-settled': {
        const matchId = get().settings.currentMatchId
        const record: RoundRecord = { ...e.record, matchId }
        const history = [...get().history, record]
        const unlocked = new Set(get().achievements.map((a) => a.id))
        const fresh = checkAchievements(history, record, unlocked)
        const achievements = [
          ...get().achievements,
          ...fresh.map((id) => ({ id, unlockedAt: Date.now() }))
        ]
        const dict = get().t()
        for (const id of fresh) {
          const a = (dict.achievements as Record<string, { name: string; desc: string } | string>)[id]
          if (typeof a === 'object') get().pushToast(`🏅 ${a.name} — ${a.desc}`, 'achievement')
        }
        set({ history, achievements, lastRecord: record, awaiting: null, stepPending: null })
        persist('history', history)
        persist('achievements', achievements)
        const session = get().session
        if (session) {
          const memories = { ...get().memories, ...session.getMemorySnapshots() }
          const shoeSnapshot = session.getShoeSnapshot()
          set({ memories, shoeSnapshot })
          persist('memories', memories)
          if (get().settings.shoeMode === 'persist') persist('shoe', shoeSnapshot)
        }
        break
      }
    }
  }

  function buildSession(matchStartBankroll: number, startRoundNo: number): BlackjackSession {
    const { settings, personas, memories, shoeSnapshot } = get()
    const byId = (id: string): Persona | undefined => personas.find((p) => p.id === id)
    const opponents = settings.seatOrder
      .filter((id) => id !== 'player')
      .map(byId)
      .filter((p): p is Persona => !!p && p.role === 'opponent')
      .slice(0, 6)
    const companions = settings.companionIds
      .map(byId)
      .filter((p): p is Persona => !!p && p.role === 'companion')
      .slice(0, 3)
    const dealerPersona = settings.dealerPersonaId ? byId(settings.dealerPersonaId) : undefined
    const session = new BlackjackSession({
      rules: settings.rules,
      playerName: settings.playerName,
      playerBankroll: settings.bankroll,
      matchStartBankroll,
      startRoundNo,
      seatOrder: settings.seatOrder,
      opponents,
      companions,
      dealer: dealerPersona && dealerPersona.role === 'dealer' ? dealerPersona : null,
      settings: {
        tableTalk: settings.tableTalk,
        declarations: settings.declarations,
        dealerSettle: settings.dealerSettle,
        habitMemory: settings.habitMemory,
        playMode: settings.playMode
      },
      getProfile: get().getProfile,
      shoeSnapshot:
        settings.shoeMode === 'persist' && shoeSnapshot?.deckCount === settings.rules.decks
          ? shoeSnapshot
          : null,
      onEvent: handleEvent
    })
    session.restoreMemories(memories)
    return session
  }

  return {
    loaded: false,
    screen: 'lobby',
    settings: DEFAULT_SETTINGS,
    profiles: [LOCAL_BOT_PROFILE, DEFAULT_PROFILE],
    personas: PRESET_PERSONAS,
    history: [],
    matches: [],
    achievements: [],
    reports: [],
    memories: {},
    shoeSnapshot: null,
    session: null,
    view: null,
    feed: [],
    awaiting: null,
    thinking: {},
    stepPending: null,
    oppBankrolls: {},
    lastRecord: null,
    toasts: [],
    busyDealing: false,
    modal: null,
    analyst: null,
    dealTick: 0,

    t: () => getDict(get().settings.language as Language),

    getProfile: (id) => get().profiles.find((p) => p.id === id),

    init: async () => {
      const [settings, profiles, personas, history, matches, achievements, reports, memories, shoe] =
        await Promise.all([
          window.casino.store.load('settings'),
          window.casino.store.load('profiles'),
          window.casino.store.load('personas'),
          window.casino.store.load('history'),
          window.casino.store.load('matches'),
          window.casino.store.load('achievements'),
          window.casino.store.load('reports'),
          window.casino.store.load('memories'),
          window.casino.store.load('shoe')
        ])
      set({
        settings: settings ? migrateSettings(settings) : DEFAULT_SETTINGS,
        profiles: Array.isArray(profiles)
          ? [LOCAL_BOT_PROFILE, ...profiles.filter((p: ApiProfile) => p.id !== LOCAL_BOT_PROFILE.id).map(migrateProfile)]
          : [LOCAL_BOT_PROFILE, DEFAULT_PROFILE],
        personas: Array.isArray(personas) ? personas.map(migratePersona) : PRESET_PERSONAS,
        history: (history as RoundRecord[]) ?? [],
        matches: (matches as Match[]) ?? [],
        achievements: (achievements as Achievement[]) ?? [],
        reports: (reports as Report[]) ?? [],
        memories: (memories as AppStore['memories']) ?? {},
        shoeSnapshot: (shoe as ShoeSnapshot) ?? null,
        loaded: true
      })
      // 启动行为：continue/new 直接进桌，ask 留在大厅询问
      const st = get().settings
      if (st.startup === 'continue' && st.currentMatchId) get().enterTable('continue')
      else if (st.startup === 'new') get().enterTable('new')
    },

    setModal: (m) => set({ modal: m }),

    updateSettings: (patch) => {
      const settings = { ...get().settings, ...patch }
      set({ settings })
      persist('settings', settings)
    },

    saveProfiles: (profiles) => {
      set({ profiles })
      persist('profiles', profiles.filter((p) => p.id !== LOCAL_BOT_PROFILE.id))
    },

    savePersonas: (personas) => {
      set({ personas })
      persist('personas', personas)
    },

    currentMatch: () => {
      const id = get().settings.currentMatchId
      return get().matches.find((m) => m.id === id) ?? null
    },

    enterTable: (mode, matchName) => {
      const s = get()
      let match = mode === 'continue' ? s.currentMatch() : null
      if (!match) {
        // 新开一场
        match = {
          id: globalThis.crypto.randomUUID(),
          name: matchName?.trim() || autoMatchName(s.matches.length + 1),
          createdAt: Date.now(),
          startBankroll: s.settings.bankroll
        }
        const matches = [...s.matches.map((m) => (m.endedAt ? m : { ...m, endedAt: Date.now() })), match]
        set({ matches })
        persist('matches', matches)
        // per-match 及以下档位的记忆随新场清空
        const keep: AppStore['memories'] = {}
        for (const [pid, snap] of Object.entries(s.memories)) {
          const persona = s.personas.find((p) => p.id === pid)
          if (persona && (persona.memoryReset === 'permanent' || persona.memoryReset === 'manual')) {
            keep[pid] = snap
          }
        }
        set({ memories: keep })
        persist('memories', keep)
        get().updateSettings({ currentMatchId: match.id })
      }
      const roundsInMatch = s.history.filter((r) => r.matchId === match!.id && r.round !== 0).length
      const session = buildSession(match.startBankroll, roundsInMatch)
      set({
        session,
        screen: 'table',
        view: null,
        awaiting: null,
        stepPending: null,
        lastRecord: null,
        thinking: {},
        feed: []
      })
    },

    backToLobby: () => {
      const session = get().session
      if (session && !session.inRound) {
        const shoeSnapshot = session.getShoeSnapshot()
        set({ shoeSnapshot })
        if (get().settings.shoeMode === 'persist') persist('shoe', shoeSnapshot)
      }
      set({ screen: 'lobby', session: null, view: null, awaiting: null, stepPending: null })
    },

    renameMatch: (id, name) => {
      const matches = get().matches.map((m) => (m.id === id ? { ...m, name } : m))
      set({ matches })
      persist('matches', matches)
    },

    newShoe: () => {
      const session = get().session
      if (session?.newShoe()) {
        const shoeSnapshot = session.getShoeSnapshot()
        set({ shoeSnapshot })
        if (get().settings.shoeMode === 'persist') persist('shoe', shoeSnapshot)
      }
    },

    deal: async (bet, sideBets) => {
      const { session, settings } = get()
      if (!session || get().busyDealing || session.inRound) return
      const total = bet + Object.values(sideBets).reduce((a, b) => a + (b ?? 0), 0)
      if (total > settings.bankroll) {
        get().pushToast(get().t().errors.bankrupt, 'error')
        return
      }
      get().updateSettings({ lastBet: { bet, sideBets: sideBets as Record<string, number> } })
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

    continueStep: () => {
      set({ stepPending: null })
      get().session?.continueStep()
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
        matchId: get().settings.currentMatchId,
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
        matchId: get().settings.currentMatchId,
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

    makeReport: async (ref) => {
      const rm = resolveModelRef(ref, get().getProfile)
      if (!rm) {
        get().pushToast(get().t().errors.noModel, 'error')
        return
      }
      const res = await generateReport(rm, get().history, statsBrief(get().history))
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

    openAnalysis: async (targetId, targetName, ref) => {
      const rm = resolveModelRef(ref, get().getProfile)
      if (!rm) {
        get().pushToast(get().t().errors.noModel, 'error')
        return
      }
      const system = buildAnalystSystem(targetName)
      const brief = characterRecordsBrief(get().history, targetId === 'player' ? 'player' : targetId)
      const firstUser = `对局记录：\n${brief || '（暂无记录）'}\n\n请先给出整体分析。`
      set({
        analyst: { open: true, targetId, targetName, messages: [], system, busy: true, modelRef: ref }
      })
      const res = await callModel(rm, system, [], firstUser, 900)
      const a = get().analyst
      if (!a) return
      if (res.ok) {
        set({
          analyst: {
            ...a,
            busy: false,
            messages: [
              { role: 'user', content: firstUser },
              { role: 'assistant', content: unwrapSpeech(res.content) }
            ]
          }
        })
      } else {
        set({ analyst: { ...a, busy: false } })
        get().pushToast(`${get().t().errors.llm}: ${res.error}`, 'error')
      }
    },

    askAnalyst: async (text) => {
      const a = get().analyst
      if (!a || a.busy) return
      const rm = resolveModelRef(a.modelRef, get().getProfile)
      if (!rm) return
      set({ analyst: { ...a, busy: true } })
      const res = await callModel(rm, a.system, a.messages, text, 900)
      const cur = get().analyst
      if (!cur) return
      if (res.ok) {
        set({
          analyst: {
            ...cur,
            busy: false,
            messages: [
              ...cur.messages,
              { role: 'user', content: text },
              { role: 'assistant', content: unwrapSpeech(res.content) }
            ]
          }
        })
      } else {
        set({ analyst: { ...cur, busy: false } })
        get().pushToast(`${get().t().errors.llm}: ${res.error}`, 'error')
      }
    },

    closeAnalysis: () => set({ analyst: null }),

    pushToast: (text, kind) => {
      const toast = { id: ++toastId, text, kind }
      set({ toasts: [...get().toasts, toast] })
      setTimeout(() => get().dismissToast(toast.id), kind === 'achievement' ? 6000 : 4000)
    },

    dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
  }
})
