import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Avatar } from './Avatar'

const POS_KEY = 'casino-companion-pos'

/** 陪玩悬浮窗：可拖动、可折叠，像在耳边聊天 */
export function FloatingCompanion(): React.JSX.Element | null {
  const t = useStore((s) => s.t)()
  const session = useStore((s) => s.session)
  const feed = useStore((s) => s.feed)
  const thinking = useStore((s) => s.thinking)
  const chatWithCompanion = useStore((s) => s.chatWithCompanion)
  const companionComment = useStore((s) => s.companionComment)
  const compressMemory = useStore((s) => s.compressMemory)
  const newMemorySession = useStore((s) => s.newMemorySession)
  const personas = useStore((s) => s.personas)

  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      return JSON.parse(localStorage.getItem(POS_KEY) ?? '') as { x: number; y: number }
    } catch {
      return { x: window.innerWidth - 360, y: 90 }
    }
  })
  const [collapsed, setCollapsed] = useState(false)
  const [text, setText] = useState('')
  const [target, setTarget] = useState('')
  const dragRef = useRef<{ dx: number; dy: number } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const companions = session?.companions ?? []
  const items = feed.filter((f) => f.channel === 'companion')

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items.length])

  useEffect(() => {
    const move = (e: MouseEvent): void => {
      if (!dragRef.current) return
      const x = Math.min(Math.max(0, e.clientX - dragRef.current.dx), window.innerWidth - 80)
      const y = Math.min(Math.max(40, e.clientY - dragRef.current.dy), window.innerHeight - 60)
      setPos({ x, y })
    }
    const up = (): void => {
      if (dragRef.current) {
        dragRef.current = null
        localStorage.setItem(POS_KEY, JSON.stringify(pos))
      }
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
  }, [pos])

  if (companions.length === 0) return null

  const effectiveTarget = companions.find((c) => c.persona.id === target) ?? companions[0]

  const send = async (): Promise<void> => {
    const msg = text.trim()
    if (!msg || !effectiveTarget) return
    setText('')
    await chatWithCompanion(effectiveTarget.persona.id, msg)
  }

  return (
    <div className={`companion-float ${collapsed ? 'collapsed' : ''}`} style={{ left: pos.x, top: pos.y }}>
      <div
        className="companion-float-head"
        onMouseDown={(e) => {
          dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y }
        }}
      >
        <Avatar
          url={personas.find((p) => p.id === effectiveTarget?.persona.id)?.avatar}
          name={effectiveTarget?.persona.name ?? ''}
          size={22}
        />
        <span className="companion-float-title">{t.chat.companions}</span>
        <button
          className="btn-close"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? '▴' : '▾'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="companion-float-feed">
            {items.slice(-40).map((f) => (
              <div key={f.id} className={`feed-item ${f.speakerId === 'player' ? 'feed-self' : ''}`}>
                <span className="feed-speaker">{f.speakerName}</span>
                <span className="feed-text">{f.text}</span>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <div className="companion-float-tools">
            {companions.map((c) => (
              <div key={c.persona.id} className="companion-row">
                <span className="companion-name">
                  {c.persona.name}
                  {thinking[c.persona.id] && <span className="thinking-dot"> …</span>}
                </span>
                {c.persona.companion?.banterEnabled !== false && (
                  <button className="btn-mini" onClick={() => companionComment(c.persona.id, 'banter')}>
                    {t.chat.banter}
                  </button>
                )}
                {c.persona.companion?.adviceEnabled !== false && (
                  <button className="btn-mini" onClick={() => companionComment(c.persona.id, 'advice')}>
                    {t.chat.advice}
                  </button>
                )}
                <button className="btn-mini btn-dim" title={t.chat.compress} onClick={() => compressMemory(c.persona.id)}>
                  🗜
                </button>
                <button className="btn-mini btn-dim" title={t.chat.newSession} onClick={() => newMemorySession(c.persona.id)}>
                  ♻
                </button>
              </div>
            ))}
          </div>

          <div className="chat-input">
            {companions.length > 1 && (
              <select value={effectiveTarget?.persona.id} onChange={(e) => setTarget(e.target.value)}>
                {companions.map((c) => (
                  <option key={c.persona.id} value={c.persona.id}>
                    {c.persona.name}
                  </option>
                ))}
              </select>
            )}
            <input
              value={text}
              placeholder={t.chat.placeholder}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <button className="btn-mini" onClick={send} disabled={!text.trim()}>
              {t.chat.send}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
