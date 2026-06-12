import React from 'react'

/** 3D 质感筹码（CSS 分层：边缘条纹/内圈/高光） */
export function Chip({
  value,
  color,
  size = 46,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  dimmed
}: {
  value: number
  color: string
  size?: number
  onClick?: () => void
  onDoubleClick?: () => void
  draggable?: boolean
  onDragStart?: (e: React.DragEvent) => void
  dimmed?: boolean
}): React.JSX.Element {
  return (
    <button
      className={`chip3d ${dimmed ? 'chip-dim' : ''}`}
      style={{ width: size, height: size, ['--chip-color' as string]: color }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      draggable={draggable}
      onDragStart={onDragStart}
      title={`£${value}`}
    >
      <span className="chip3d-inner">{value >= 1000 ? `${value / 1000}K` : value}</span>
    </button>
  )
}

/** 桌面筹码堆：按面额贪心拆分，错位堆叠 */
export function ChipStack({
  amount,
  colors,
  label
}: {
  amount: number
  colors: Record<number, string>
  label?: string
}): React.JSX.Element | null {
  if (amount <= 0) return null
  const denoms = Object.keys(colors).map(Number).sort((a, b) => b - a)
  const chips: number[] = []
  let rest = amount
  for (const d of denoms) {
    while (rest >= d && chips.length < 12) {
      chips.push(d)
      rest -= d
    }
  }
  if (rest > 0 && chips.length < 12) chips.push(denoms[denoms.length - 1])
  return (
    <div className="chip-stack" title={`£${amount}`}>
      <div className="chip-stack-pile">
        {chips.map((d, i) => (
          <span
            key={i}
            className="chip-stack-coin"
            style={{ ['--chip-color' as string]: colors[d] ?? '#666', bottom: i * 5 }}
          />
        ))}
      </div>
      <span className="chip-stack-amount">{label ?? `£${amount}`}</span>
    </div>
  )
}
