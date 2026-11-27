import { useState } from 'react'
import { applyTheme, getStoredMode, storeMode } from '../lib/theme'

const OPTIONS = [
  { mode: 'light', label: '라이트' },
  { mode: 'dark', label: '다크' },
  { mode: 'system', label: '시스템' },
]

export default function ThemeSwitch() {
  const [mode, setMode] = useState(getStoredMode)
  function choose(next) {
    setMode(next)
    applyTheme(next)
    storeMode(next)
  }
  return (
    <div className="theme-switch" role="group" aria-label="화면 모드">
      {OPTIONS.map((option) => (
        <button
          key={option.mode}
          type="button"
          className={mode === option.mode ? 'selected' : ''}
          aria-pressed={mode === option.mode}
          onClick={() => choose(option.mode)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
