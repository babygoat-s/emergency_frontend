import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyTheme, getStoredMode, watchSystemTheme } from './lib/theme'
import AuthenticatedApp from './components/AuthenticatedApp.jsx'

applyTheme(getStoredMode())
watchSystemTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AuthenticatedApp />
  </StrictMode>,
)
