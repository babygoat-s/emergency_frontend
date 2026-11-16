import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../lib/results'
import Icon from './Icon'

export default function AudioPlayer({ src, onDuration }) {
  const audio = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const element = audio.current
    return () => element?.pause()
  }, [])

  async function togglePlayback() {
    if (playing) {
      audio.current.pause()
      return
    }
    try {
      await audio.current.play()
      setError('')
    } catch {
      setError('오디오를 재생할 수 없습니다. 파일 형식을 확인해 주세요.')
    }
  }

  function seek(event) {
    const next = Number(event.target.value)
    audio.current.currentTime = next
    setPosition(next)
  }

  function toggleMute() {
    const next = !muted
    audio.current.muted = next
    setMuted(next)
  }

  return (
    <div className="audio-preview">
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration
          setDuration(Number.isFinite(seconds) ? seconds : 0)
          onDuration(seconds)
        }}
        onTimeUpdate={(event) => setPosition(event.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setError('오디오를 불러올 수 없습니다. 파일을 다시 선택해 주세요.')}
      />
      <div className="audio-player" role="group" aria-label="선택한 음성 미리 듣기">
        <button
          className="audio-play"
          onClick={togglePlayback}
          aria-label={playing ? '음성 일시 정지' : '음성 재생'}
        >
          <Icon name={playing ? 'pause' : 'play'} size={17} />
        </button>
        <span className="audio-time">{formatTime(position)}</span>
        <input
          className="audio-seek"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={Math.min(position, duration)}
          disabled={!duration}
          onChange={seek}
          aria-label="음성 재생 위치"
          aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}
        />
        <span className="audio-time audio-duration">{formatTime(duration)}</span>
        <button
          className="icon-button"
          onClick={toggleMute}
          aria-label={muted ? '음소거 해제' : '음소거'}
          aria-pressed={muted}
        >
          <Icon name={muted ? 'muted' : 'volume'} size={17} />
        </button>
      </div>
      {error && (
        <p className="validation-note" role="status">
          {error}
        </p>
      )}
    </div>
  )
}
