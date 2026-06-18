import React, { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { Avatar } from './Avatar'

/** 右侧栏：牌桌桌聊 + 台面日志（陪玩在悬浮窗）。移动端 drawer 模式作底部抽屉。 */
export function ChatPanel({
  drawerOpen = false,
  onClose
}: { drawerOpen?: boolean; onClose?: () => void } = {}): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const feed = useStore((s) => s.feed)
  const session = useStore((s) => s.session)
  const personas = useStore((s) => s.personas)
  const sendToOpponent = useStore((s) => s.sendToOpponent)

  const [text, setText] = useState('')
  const [target, setTarget] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const items = feed.filter((f) => f.channel === 'table')

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [items.length])

  const opponents = session?.opponents ?? []
  const effectiveTarget = opponents.find((c) => c.persona.id === target) ?? opponents[0]

  const send = (): void => {
    const msg = text.trim()
    if (!msg || !effectiveTarget) return
    setText('')
    sendToOpponent(effectiveTarget.persona.id, msg)
  }

  return (
    <div className={`chat-panel ${drawerOpen ? 'drawer-open' : ''}`}>
      <button className="drawer-handle" onClick={onClose} aria-label="close">
        <span />
      </button>
      <div className="chat-tabs">
        <button className="on">{t.chat.tableTalk}</button>
      </div>

      <div className="chat-feed">
        {items.map((f) => (
          <div key={f.id} className={`feed-item feed-${f.kind} ${f.speakerId === 'player' ? 'feed-self' : ''}`}>
            {f.kind === 'utterance' && (
              <Avatar
                url={personas.find((p) => p.id === f.speakerId)?.avatar}
                name={f.speakerName}
                size={18}
              />
            )}
            <span className="feed-speaker">{f.speakerName}</span>
            <span className="feed-text">{f.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {opponents.length > 0 && (
        <div className="chat-input">
          {opponents.length > 1 && (
            <select value={effectiveTarget?.persona.id} onChange={(e) => setTarget(e.target.value)}>
              {opponents.map((c) => (
                <option key={c.persona.id} value={c.persona.id}>
                  {c.persona.name}
                </option>
              ))}
            </select>
          )}
          <input
            value={text}
            placeholder={t.chat.toOpponent}
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
