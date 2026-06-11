import React, { useEffect } from 'react'
import { useStore } from './ui/store'
import { Table } from './ui/components/Table'
import { ChatPanel } from './ui/components/ChatPanel'
import { SettingsModal } from './ui/components/SettingsModal'
import { ProfilesModal } from './ui/components/ProfilesModal'
import { PersonasModal } from './ui/components/PersonasModal'
import { HistoryModal } from './ui/components/HistoryModal'
import { AchievementsModal } from './ui/components/AchievementsModal'

export default function App(): React.JSX.Element {
  const loaded = useStore((s) => s.loaded)
  const init = useStore((s) => s.init)
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const view = useStore((s) => s.view)
  const modal = useStore((s) => s.modal)
  const setModal = useStore((s) => s.setModal)
  const toasts = useStore((s) => s.toasts)
  const dismissToast = useStore((s) => s.dismissToast)

  useEffect(() => {
    init()
  }, [init])

  if (!loaded) return <div className="loading">♠ ♥ ♦ ♣</div>

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>{t.app.title}</h1>
          <span>{t.app.subtitle}</span>
        </div>
        <div className="shoe-info">
          {view && (
            <>
              <span>
                {t.table.shoe}: {view.seen.deckCount} {t.table.decksInPlay}
              </span>
              <span>
                {t.table.cardsDealt} {view.seen.dealt} / {t.table.cardsLeft} {view.seen.remaining}
              </span>
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
          <button onClick={() => setModal('settings')}>{t.panels.settings}</button>
        </nav>
      </header>

      <main className="layout">
        <Table />
        <ChatPanel />
      </main>

      {modal === 'settings' && <SettingsModal />}
      {modal === 'profiles' && <ProfilesModal />}
      {modal === 'personas' && <PersonasModal />}
      {modal === 'history' && <HistoryModal />}
      {modal === 'achievements' && <AchievementsModal />}

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
