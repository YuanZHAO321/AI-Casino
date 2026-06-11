import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

export function ChatPanel(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const feed = useStore((s) => s.feed)
  const session = useStore((s) => s.session)
  const thinking = useStore((s) => s.thinking)
  const sendToOpponent = useStore((s) => s.sendToOpponent)
  const chatWithCompanion = useStore((s) => s.chatWithCompanion)
  const companionComment = useStore((s) => s.companionComment)
  const compressMemory = useStore((s) => s.compressMemory)
  const newMemorySession = useStore((s) => s.newMemorySession)

  const [tab, setTab] = useState<'table' | 'companion'>('table')
  const [text, setText] = useState('')
  const [target, setTarget] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const items = feed.filter((f) => (tab === 'table' ? f.channel === 'table' : f.channel === 'companion'))

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items.length])

  const opponents = session?.opponents ?? []
  const companions = session?.companions ?? []
  const targets = tab === 'table' ? opponents : companions
  const effectiveTarget = targets.find((c) => c.persona.id === target) ?? targets[0]

  const send = async (): Promise<void> => {
    const msg = text.trim()
    if (!msg || !effectiveTarget) return
    setText('')
    if (tab === 'table') sendToOpponent(effectiveTarget.persona.id, msg)
    else await chatWithCompanion(effectiveTarget.persona.id, msg)
  }

  return (
    <div className="chat-panel">
      <div className="chat-tabs">
        <button className={tab === 'table' ? 'on' : ''} onClick={() => setTab('table')}>
          {t.chat.tableTalk}
        </button>
        <button className={tab === 'companion' ? 'on' : ''} onClick={() => setTab('companion')}>
          {t.chat.companions}
        </button>
      </div>

      <div className="chat-feed">
        {items.map((f) => (
          <div key={f.id} className={`feed-item feed-${f.kind} ${f.speakerId === 'player' ? 'feed-self' : ''}`}>
            <span className="feed-speaker">{f.speakerName}</span>
            <span className="feed-text">{f.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {tab === 'companion' && companions.length > 0 && (
        <div className="companion-tools">
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
      )}

      {targets.length > 0 && (
        <div className="chat-input">
          {targets.length > 1 && (
            <select value={effectiveTarget?.persona.id} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((c) => (
                <option key={c.persona.id} value={c.persona.id}>
                  {c.persona.name}
                </option>
              ))}
            </select>
          )}
          <input
            value={text}
            placeholder={tab === 'table' ? t.chat.toOpponent : t.chat.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="btn-mini" onClick={send} disabled={!text.trim()}>
            {t.chat.send}
          </button>
        </div>
      )}
    </div>
  )
}
