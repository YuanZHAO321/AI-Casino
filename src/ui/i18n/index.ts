import { zh, Dict } from './zh'
import { en } from './en'

export type Language = 'zh' | 'en'

const dicts: Record<Language, Dict> = { zh, en }

export function getDict(lang: Language): Dict {
  return dicts[lang] ?? zh
}
