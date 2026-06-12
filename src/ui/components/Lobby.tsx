import React, { useState } from 'react'
import { useStore } from '../store'
import { TtsWizard } from './TtsModal'

/** 赌场大厅：游戏选择 + 继续/新开一场 */
export function Lobby(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const matches = useStore((s) => s.matches)
  const history = useStore((s) => s.history)
  const enterTable = useStore((s) => s.enterTable)
  const setModal = useStore((s) => s.setModal)
  const [choosing, setChoosing] = useState(false)
  const [matchName, setMatchName] = useState('')

  const lastMatch = matches.find((m) => m.id === settings.currentMatchId)
  const lastRounds = lastMatch
    ? history.filter((r) => r.matchId === lastMatch.id && r.round !== 0).length
    : 0

  const onPlay = (): void => {
    if (settings.startup === 'ask' && lastMatch) setChoosing(true)
    else enterTable(lastMatch && settings.startup === 'continue' ? 'continue' : 'new')
  }

  return (
    <div className="lobby">
      {!settings.ttsSetupDone && <TtsWizard />}
      <div className="lobby-inner">
        <header className="lobby-brand">
          <h1>{t.app.title}</h1>
          <div className="lobby-rule" />
          <p>{t.lobby.welcome} · {settings.playerName}</p>
        </header>

        <div className="lobby-games">
          <button className="game-card" onClick={onPlay}>
            <span className="game-card-suits">♠ ♥ ♦ ♣</span>
            <strong>{t.lobby.blackjack}</strong>
            <em>{t.lobby.blackjackDesc}</em>
          </button>
          <div className="game-card game-card-soon">
            <span className="game-card-suits">🎲</span>
            <em>{t.lobby.comingSoon}</em>
          </div>
        </div>

        <nav className="lobby-nav">
          <button onClick={() => setModal('profiles')}>{t.panels.profiles}</button>
          <button onClick={() => setModal('personas')}>{t.panels.personas}</button>
          <button onClick={() => setModal('history')}>{t.panels.history}</button>
          <button onClick={() => setModal('achievements')}>{t.panels.achievements}</button>
          <button onClick={() => setModal('bgm')}>{t.panels.bgm}</button>
          <button onClick={() => setModal('tts')}>{t.panels.tts}</button>
          <button onClick={() => setModal('settings')}>{t.panels.settings}</button>
        </nav>
      </div>

      {choosing && (
        <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setChoosing(false)}>
          <div className="modal match-dialog">
            <div className="modal-body">
              {lastMatch && (
                <button className="match-option" onClick={() => enterTable('continue')}>
                  <strong>{t.lobby.continueMatch}</strong>
                  <em>
                    {lastMatch.name} · {lastRounds} {t.lobby.roundsPlayed} · £{settings.bankroll}
                  </em>
                </button>
              )}
              <div className="match-option match-option-new">
                <input
                  value={matchName}
                  placeholder={t.lobby.matchNamePlaceholder}
                  onChange={(e) => setMatchName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && enterTable('new', matchName)}
                />
                <button className="btn-primary" onClick={() => enterTable('new', matchName)}>
                  {t.lobby.newMatch}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
