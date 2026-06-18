import React, { useEffect, useState } from 'react'
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

type LayoutMode = 'side' | 'stacked' | 'drawer'

/** 据视口与竖屏设置判定布局：side=左右并排 / stacked=上下常驻 / drawer=底部抽屉呼出 */
function useLayoutMode(portrait: 'drawer' | 'stacked'): LayoutMode {
  const compute = (): LayoutMode => {
    if (typeof window === 'undefined') return 'side'
    const w = window.innerWidth
    const h = window.innerHeight
    const landscape = w > h
    const small = w < 880 || (landscape && h <= 500) // 窄屏 或 大屏手机横屏
    if (!small) return 'side'
    if (!landscape && portrait === 'stacked') return 'stacked'
    return 'drawer'
  }
  const [mode, setMode] = useState<LayoutMode>(compute)
  useEffect(() => {
    const on = (): void => setMode(compute())
    on()
    window.addEventListener('resize', on)
    window.addEventListener('orientationchange', on)
    return () => {
      window.removeEventListener('resize', on)
      window.removeEventListener('orientationchange', on)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portrait])
  return mode
}

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
  const session = useStore((s) => s.session)
  const toasts = useStore((s) => s.toasts)
  const dismissToast = useStore((s) => s.dismissToast)

  const layoutMode = useLayoutMode(settings.portraitLayout)

  // 移动端：底部抽屉当前打开的面板；顶栏菜单展开态
  const [mobilePanel, setMobilePanel] = useState<'none' | 'chat' | 'companion'>('none')
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    init()
  }, [init])

  // 切屏/开模态/换布局时收起抽屉与菜单
  useEffect(() => {
    setMobilePanel('none')
    setNavOpen(false)
  }, [screen, modal, layoutMode])

  if (!loaded) return <div className="loading">♠ ♥ ♦ ♣</div>

  const ap = settings.appearance
  const ambienceUrl = ap.ambienceUrl ?? 'textures/ambience.png'
  const feltUrl = ap.feltUrl ?? 'textures/felt.png'
  const match = currentMatch()

  const hasCompanions = (session?.companions?.length ?? 0) > 0

  return (
    <div
      className="app"
      data-mode={layoutMode}
      style={{ ['--felt-texture' as string]: `url("${feltUrl}")` }}
    >
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
            <button
              className="btn-ghost nav-toggle"
              aria-label="menu"
              onClick={() => setNavOpen((o) => !o)}
            >
              ☰
            </button>
            <nav className={`topnav ${navOpen ? 'open' : ''}`}>
              <button onClick={() => setModal('profiles')}>{t.panels.profiles}</button>
              <button onClick={() => setModal('personas')}>{t.panels.personas}</button>
              <button onClick={() => setModal('history')}>{t.panels.history}</button>
              <button onClick={() => setModal('achievements')}>{t.panels.achievements}</button>
              <button onClick={() => setModal('bgm')}>{t.panels.bgm}</button>
              <button onClick={() => setModal('tts')}>{t.panels.tts}</button>
              <button onClick={() => setModal('settings')}>{t.panels.settings}</button>
            </nav>
          </header>

          <main className={`layout layout-${layoutMode}`}>
            <Table />
            {layoutMode === 'side' && <ChatPanel variant="side" />}
            {layoutMode === 'stacked' && (
              <div className="stack-panels">
                <ChatPanel variant="inline" />
                {hasCompanions && <FloatingCompanion variant="inline" />}
              </div>
            )}
          </main>

          {/* 桌面悬浮陪玩 */}
          {layoutMode === 'side' && <FloatingCompanion variant="side" />}

          {/* 移动端底部抽屉 + 呼出按钮 */}
          {layoutMode === 'drawer' && (
            <>
              {mobilePanel !== 'none' && (
                <div className="drawer-scrim" onClick={() => setMobilePanel('none')} />
              )}
              <ChatPanel
                variant="drawer"
                drawerOpen={mobilePanel === 'chat'}
                onClose={() => setMobilePanel('none')}
              />
              <FloatingCompanion
                variant="drawer"
                drawerOpen={mobilePanel === 'companion'}
                onClose={() => setMobilePanel('none')}
              />
              {!modal && (
                <div className="mobile-dock">
                  <button
                    className={mobilePanel === 'chat' ? 'on' : ''}
                    onClick={() => setMobilePanel((p) => (p === 'chat' ? 'none' : 'chat'))}
                  >
                    💬 {t.chat.tableTalk}
                  </button>
                  {hasCompanions && (
                    <button
                      className={mobilePanel === 'companion' ? 'on' : ''}
                      onClick={() => setMobilePanel((p) => (p === 'companion' ? 'none' : 'companion'))}
                    >
                      🗣 {t.chat.companions}
                    </button>
                  )}
                </div>
              )}
            </>
          )}
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
