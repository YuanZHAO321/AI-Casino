import React from 'react'

/**
 * 程序化 SVG 扑克牌：保证 52 张清晰一致，不依赖生成图片。
 * label 形如 '♠A' '♥10'
 */
export function PlayingCard({ label, w = 64 }: { label: string; w?: number }): React.JSX.Element {
  const suit = label[0]
  const rank = label.slice(1)
  const red = suit === '♥' || suit === '♦'
  const h = w * 1.45
  const color = red ? '#b3262e' : '#1c1c22'
  return (
    <svg className="pcard" width={w} height={h} viewBox="0 0 64 93" aria-label={label}>
      <rect x="0.8" y="0.8" width="62.4" height="91.4" rx="6" fill="#fdfcf7" stroke="#c9c4b4" strokeWidth="1" />
      <text x="6" y="17" fontSize="15" fontWeight="700" fill={color} fontFamily="Georgia, serif">{rank}</text>
      <text x="6" y="31" fontSize="13" fill={color}>{suit}</text>
      <g transform="rotate(180 32 46.5)">
        <text x="6" y="17" fontSize="15" fontWeight="700" fill={color} fontFamily="Georgia, serif">{rank}</text>
        <text x="6" y="31" fontSize="13" fill={color}>{suit}</text>
      </g>
      <text x="32" y="57" fontSize="30" fill={color} textAnchor="middle">{suit}</text>
    </svg>
  )
}

export function CardBack({ w = 64 }: { w?: number }): React.JSX.Element {
  const h = w * 1.45
  return (
    <svg className="pcard" width={w} height={h} viewBox="0 0 64 93">
      <rect x="0.8" y="0.8" width="62.4" height="91.4" rx="6" fill="#173c2c" stroke="#c9a86a" strokeWidth="1.2" />
      <rect x="6" y="6" width="52" height="81" rx="3" fill="none" stroke="#c9a86a" strokeWidth="0.8" opacity="0.8" />
      <pattern id="bk" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill="#173c2c" />
        <circle cx="4" cy="4" r="1" fill="#c9a86a" opacity="0.5" />
      </pattern>
      <rect x="6" y="6" width="52" height="81" rx="3" fill="url(#bk)" />
      <text x="32" y="52" fontSize="16" fill="#c9a86a" textAnchor="middle" fontFamily="Georgia, serif" opacity="0.9">♠</text>
    </svg>
  )
}
