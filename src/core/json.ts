/**
 * 健壮 JSON 提取：兼容劣质模型输出（围栏代码块、前后废话、单引号等不处理，
 * 只做安全的「找到第一个平衡的 JSON 对象」提取）。
 */
export function extractJsonObject(text: string): Record<string, unknown> | null {
  // 优先尝试整体解析
  try {
    const v = JSON.parse(text)
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    /* 继续 */
  }
  // 扫描第一个平衡的大括号块（忽略字符串内的括号）
  const start = text.indexOf('{')
  if (start === -1) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) {
        try {
          const v = JSON.parse(text.slice(start, i + 1))
          if (v && typeof v === 'object' && !Array.isArray(v)) {
            return v as Record<string, unknown>
          }
        } catch {
          return null
        }
        return null
      }
    }
  }
  return null
}

/** 取字符串字段，宽容大小写与空白 */
export function strField(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

/** 取数字字段，宽容字符串数字 */
export function numField(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string') {
    const n = Number(v.replace(/[£$,\s]/g, ''))
    if (Number.isFinite(n)) return n
  }
  return undefined
}
