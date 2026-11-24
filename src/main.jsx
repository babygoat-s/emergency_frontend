import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { applyTheme, getStoredMode, watchSystemTheme } from './lib/theme'
import App from './App.jsx'

applyTheme(getStoredMode())
watchSystemTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
