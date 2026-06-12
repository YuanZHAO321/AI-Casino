import React from 'react'
import { useStore } from '../store'
import { Modal } from './Modal'
import { playBgm, stopBgm, setBgmVolume, playingTrackId } from '../audio'
import { BgmTrack } from '../presets'

export function BgmModal(): React.JSX.Element {
  const t = useStore((s) => s.t)()
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const setModal = useStore((s) => s.setModal)
  const audio = settings.audio
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)

  const patchAudio = (p: Partial<typeof audio>): void =>
    updateSettings({ audio: { ...audio, ...p } })

  const upload = async (): Promise<void> => {
    const res = await window.casino.files.import('audio', 'music')
    if (res.ok && res.url) {
      const track: BgmTrack = {
        id: globalThis.crypto.randomUUID(),
        name: res.name ?? '音乐',
        url: res.url
      }
      patchAudio({ bgmTracks: [...audio.bgmTracks, track] })
    }
  }

  const removeTrack = (track: BgmTrack): void => {
    if (playingTrackId() === track.id) stopBgm()
    void window.casino.files.remove(track.url)
    patchAudio({ bgmTracks: audio.bgmTracks.filter((x) => x.id !== track.id) })
  }

  const play = (track: BgmTrack): void => {
    playBgm(track, audio.bgmVolume, audio.bgmLoop, () => {
      // 非循环：顺序播下一首
      const list = useStore.getState().settings.audio.bgmTracks
      const idx = list.findIndex((x) => x.id === track.id)
      const next = list[(idx + 1) % list.length]
      if (next && list.length > 1) play(next)
      forceUpdate()
    })
    patchAudio({ currentTrackId: track.id })
    forceUpdate()
  }

  const nowPlaying = playingTrackId()

  return (
    <Modal title={t.bgm.title} onClose={() => setModal(null)}>
      <div className="form-row">
        <button className="btn-primary" onClick={upload}>{t.bgm.upload}</button>
        <label className="check-row" style={{ marginLeft: 12 }}>
          <input
            type="checkbox"
            checked={audio.bgmLoop}
            onChange={(e) => patchAudio({ bgmLoop: e.target.checked })}
          />
          {t.bgm.loop}
        </label>
      </div>
      <div className="form-row">
        <label>{t.bgm.volume}</label>
        <input
          type="range" min={0} max={1} step={0.05}
          value={audio.bgmVolume}
          onChange={(e) => {
            const v = Number(e.target.value)
            patchAudio({ bgmVolume: v })
            setBgmVolume(v)
          }}
        />
        <span className="range-val">{Math.round(audio.bgmVolume * 100)}%</span>
      </div>

      {audio.bgmTracks.length === 0 && <p className="form-note">{t.bgm.empty}</p>}
      <div className="records-list">
        {audio.bgmTracks.map((track) => (
          <div key={track.id} className={`record-row bgm-row ${nowPlaying === track.id ? 'bgm-playing' : ''}`}>
            <span className="bgm-name">{nowPlaying === track.id ? '♪ ' : ''}{track.name}</span>
            {nowPlaying === track.id ? (
              <button className="btn-mini" onClick={() => { stopBgm(); forceUpdate() }}>
                {t.bgm.pause}
              </button>
            ) : (
              <button className="btn-mini" onClick={() => play(track)}>{t.bgm.play}</button>
            )}
            <button className="btn-mini btn-dim" onClick={() => removeTrack(track)}>✕</button>
          </div>
        ))}
      </div>
      <p className="form-note">{t.bgm.recommend}</p>
    </Modal>
  )
}
