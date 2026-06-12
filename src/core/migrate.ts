/** v0.1 → v0.2 存储迁移（profiles / personas / settings 旧字段） */
import { ApiProfile, Persona, MemoryReset, HistoryAwareness, LOCAL_BOT_PROFILE_ID } from './types'

interface LegacyProfile extends Partial<ApiProfile> {
  model?: string
}

export function migrateProfile(raw: unknown): ApiProfile {
  const p = raw as LegacyProfile
  return {
    id: p.id ?? globalThis.crypto.randomUUID(),
    name: p.name ?? 'API',
    baseURL: p.baseURL ?? '',
    apiKey: p.apiKey ?? '',
    models: Array.isArray(p.models)
      ? p.models
      : p.model
        ? [p.model]
        : [],
    temperature: p.temperature ?? 0.8,
    useJsonMode: p.useJsonMode ?? true
  }
}

interface LegacyPersona extends Partial<Persona> {
  profileId?: string
  memoryMode?: 'persistent' | 'session' | 'per-round'
}

const MEMORY_MIGRATION: Record<string, MemoryReset> = {
  persistent: 'permanent',
  session: 'per-launch',
  'per-round': 'per-round'
}

export function migratePersona(raw: unknown): Persona {
  const p = raw as LegacyPersona
  const fast = p.fast ?? {
    profileId: p.profileId ?? LOCAL_BOT_PROFILE_ID,
    model: ''
  }
  return {
    id: p.id ?? globalThis.crypto.randomUUID(),
    name: p.name ?? '角色',
    role: p.role ?? 'opponent',
    avatar: p.avatar,
    promptMode: p.promptMode ?? 'simple',
    characterText: p.characterText ?? '',
    fast,
    smart: p.smart,
    backup: p.backup,
    cardCounting: p.cardCounting ?? false,
    speechEnabled: p.speechEnabled ?? true,
    memoryReset: p.memoryReset ?? MEMORY_MIGRATION[p.memoryMode ?? ''] ?? 'per-match',
    historyAwareness: (p.historyAwareness as HistoryAwareness) ?? 'brief',
    voice: p.voice,
    companion: p.companion,
    dealerCommentMode: p.dealerCommentMode,
    dealerCommentChance: p.dealerCommentChance,
    dealerUseModel: p.dealerUseModel ?? false,
    dealerDrawSpeech: p.dealerDrawSpeech ?? false
  }
}
