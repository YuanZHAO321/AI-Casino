import React from 'react'

/** 头像：有图用图（casino-asset），无图用首字母圆徽 */
export function Avatar({ url, name, size = 28 }: { url?: string; name: string; size?: number }): React.JSX.Element {
  if (url) {
    return (
      <img
        className="avatar"
        src={url}
        alt={name}
        style={{ width: size, height: size }}
        draggable={false}
      />
    )
  }
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <span className="avatar avatar-initial" style={{ width: size, height: size, fontSize: size * 0.5 }}>
      {initial}
    </span>
  )
}
