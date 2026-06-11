import React from 'react'
import { useStore } from '../store'
import { BlackjackAction } from '@/games/blackjack/types'

export function ActionBar({ legal }: { legal: BlackjackAction[] }): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const playerAction = useStore((s) => s.playerAction)
  const view = useStore((s) => s.view)
  const bankroll = useStore((s) => s.settings.bankroll)

  // 加倍/分牌需追加一份原始注：余额（尚未扣除本局已下注）必须够付
  const playerSeat = view?.seats.find((s) => s.isHuman)
  const committed = playerSeat
    ? playerSeat.hands.reduce((n, h) => n + h.bet, 0) +
      Object.values(playerSeat.sideBets).reduce((n, v) => n + (v ?? 0), 0)
    : 0
  const canAfford = playerSeat ? bankroll >= committed + playerSeat.baseBet : true

  const order: BlackjackAction[] = ['hit', 'stand', 'double', 'split']
  return (
    <div className="action-bar">
      {order.map((a) => (
        <button
          key={a}
          className={`btn-action btn-${a}`}
          disabled={!legal.includes(a) || ((a === 'double' || a === 'split') && !canAfford)}
          onClick={() => playerAction(a)}
        >
          {t.actions[a]}
        </button>
      ))}
    </div>
  )
}
