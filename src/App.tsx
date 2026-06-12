import React, { useEffect } from 'react'
import { useStore } from './ui/store'
import { Lobby } from './ui/components/Lobby'
import { Table } from './ui/components/Table'
import { ChatPanel } from './ui/components/ChatPanel'
import { FloatingCompanion } from './ui/components/FloatingCompanion'
import { SettingsModal } from './ui/components/SettingsModal'
import { ProfilesModal } from './ui/components/ProfilesModal'
import { PersonasModal } from './ui/components/PersonasModal'
import { HistoryModal, AnalystDialog } from './ui/components/HistoryModal'
import { AchievementsModal } from './ui/components/AchievementsModal'
import { BgmModal } from './ui/components/BgmModal'
import { TtsModal } from './ui/components/TtsModal'

export default function App(): React.JSX.Element {
  const loaded = useStore((s) => s.loaded)
  const init = useStore((s) => s.init)
  const t = useStore((s) => s.t)()
  const screen = useStore((s) => s.screen)
  const settings = useStore((s) => s.settings)
  const view = useStore((s) => s.view)
  const modal = useStore((s) => s.modal)
  const analyst = useStore((s) => s.analyst)
  const setModal = useStore((s) => s.setModal)
  const backToLobby = useStore((s) => s.backToLobby)
  const currentMatch = useStore((s) => s.currentMatch)
  const toasts = useStore((s) => s.toasts)
  const dismissToast = useStore((s) => s.dismissToast)

  useEffect(() => {
    init()
  }, [init])

  if (!loaded) return <div className="loading">♠ ♥ ♦ ♣</div>

  const ap = settings.appearance
  const ambienceUrl = ap.ambienceUrl ?? 'textures/ambience.png'
  const feltUrl = ap.feltUrl ?? 'textures/felt.png'
  const match = currentMatch()

  return (
    <div className="app" style={{ ['--felt-texture' as string]: `url("${feltUrl}")` }}>
      {/* 环境背景层（模糊/暗度可调） */}
      <div
        className="app-bg"
        style={{
          backgroundImage: `url("${ambienceUrl}")`,
          filter: `blur(${ap.ambienceBlur}px) brightness(${ap.ambienceDim})`
        }}
      />

      {screen === 'lobby' ? (
        <Lobby />
      ) : (
        <>
          <header className="topbar">
            <button className="btn-ghost btn-lobby" onClick={backToLobby}>
              {t.table.backToLobby}
            </button>
            <div className="brand">
              <h1>{t.app.title}</h1>
              <span>
                {match?.name ?? t.app.subtitle}
                {view ? ` · ${t.table.roundLabel.replace('{n}', String(view.round))}` : ''}
              </span>
            </div>
            <div className="shoe-info">
              {view && (
                <>
                  <span>{t.table.shoe}: {view.seen.deckCount} {t.table.decksInPlay}</span>
                  <span>{t.table.cardsDealt} {view.seen.dealt} / {t.table.cardsLeft} {view.seen.remaining}</span>
                </>
              )}
            </div>
            <div className="bankroll-display">
              {t.table.bankroll} <strong>£{settings.bankroll}</strong>
            </div>
            <nav className="topnav">
              <button onClick={() => setModal('profiles')}>{t.panels.profiles}</button>
              <button onClick={() => setModal('personas')}>{t.panels.personas}</button>
              <button onClick={() => setModal('history')}>{t.panels.history}</button>
              <button onClick={() => setModal('achievements')}>{t.panels.achievements}</button>
              <button onClick={() => setModal('bgm')}>{t.panels.bgm}</button>
              <button onClick={() => setModal('tts')}>{t.panels.tts}</button>
              <button onClick={() => setModal('settings')}>{t.panels.settings}</button>
            </nav>
          </header>

          <main className="layout">
            <Table />
            <ChatPanel />
          </main>
          <FloatingCompanion />
        </>
      )}

      {modal === 'settings' && <SettingsModal />}
      {modal === 'profiles' && <ProfilesModal />}
      {modal === 'personas' && <PersonasModal />}
      {modal === 'history' && <HistoryModal />}
      {modal === 'achievements' && <AchievementsModal />}
      {modal === 'bgm' && <BgmModal />}
      {modal === 'tts' && <TtsModal />}
      {analyst?.open && <AnalystDialog />}

      <div className="toasts">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`} onClick={() => dismissToast(toast.id)}>
            {toast.text}
          </div>
        ))}
      </div>
    </div>
  )
}
