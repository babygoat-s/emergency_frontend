// 화면 모드: 'system'(OS 설정 따르기, 기본) | 'light' | 'dark'
// <html data-theme="light|dark"> 로 CSS 변수 세트를 고른다. 'system' 은 OS 설정을 읽어 둘 중 하나로 풀어서 적용한다.
const KEY = 'theme-mode'
export const THEME_MODES = ['light', 'dark', 'system']

export function getStoredMode() {
  try {
    const saved = window.localStorage.getItem(KEY)
    return THEME_MODES.includes(saved) ? saved : 'system'
  } catch {
    return 'system'
  }
}

function systemTheme() {
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode === 'system' ? systemTheme() : mode)
}

export function storeMode(mode) {
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {
    // 저장이 막힌 환경에서는 이번 접속에서만 적용된다.
  }
}

// OS 설정이 바뀌면 '시스템' 모드일 때 바로 따라간다.
export function watchSystemTheme() {
  const query = window.matchMedia?.('(prefers-color-scheme: light)')
  query?.addEventListener('change', () => {
    if (getStoredMode() === 'system') applyTheme('system')
  })
}
