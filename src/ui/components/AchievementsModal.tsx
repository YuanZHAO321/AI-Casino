import React from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { ACHIEVEMENTS } from '@/core/achievements'

export function AchievementsModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const achievements = useStore((s) => s.achievements)
  const setModal = useStore((s) => s.setModal)
  const unlockedMap = new Map(achievements.map((a) => [a.id, a.unlockedAt]))

  return (
    <Modal title={t.achievements.title} onClose={() => setModal(null)}>
      <div className="achievement-grid">
        {ACHIEVEMENTS.map((def) => {
          const meta = (t.achievements as Record<string, { name: string; desc: string } | string>)[def.id]
          if (typeof meta !== 'object') return null
          const at = unlockedMap.get(def.id)
          return (
            <div key={def.id} className={`achievement ${at ? 'unlocked' : 'locked'}`}>
              <div className="ach-medal">{at ? '🏅' : '🔒'}</div>
              <div className="ach-text">
                <strong>{meta.name}</strong>
                <span>{meta.desc}</span>
                <em>
                  {at ? `${t.achievements.unlocked} ${new Date(at).toLocaleDateString()}` : t.achievements.locked}
                </em>
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
