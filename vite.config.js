import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendUrl = env.BE_API_BASE_URL?.trim()
  const googleClientId = env.VITE_GOOGLE_OAUTH_CLIENT_ID?.trim() || env.GOOGLE_CLIENT_ID?.trim() || ''
  if (googleClientId && !/^[A-Za-z0-9-]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
    throw new Error('GOOGLE_CLIENT_ID must be a Google OAuth web client ID.')
  }
  let backendOrigin = ''
  if (command === 'build' && !env.VITE_API_BASE_URL?.trim() && backendUrl) {
    const url = URL.parse(backendUrl)
    if (!url || !/^https:\/\/[^/?#]+\/?$/i.test(backendUrl) || url.username || url.password) {
      throw new Error('BE_API_BASE_URL must be an HTTPS origin without credentials or a path.')
    }
    backendOrigin = url.origin
  }
  const proxy = {
    '/api': {
      target: env.API_PROXY_TARGET || backendUrl || 'http://127.0.0.1:8000',
      changeOrigin: true,
      ws: true,
    },
  }
  return {
    plugins: [react()],
    define: {
      'import.meta.env.BE_API_BASE_URL': JSON.stringify(backendOrigin),
      'import.meta.env.GOOGLE_CLIENT_ID': JSON.stringify(googleClientId),
    },
    server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
    preview: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
  }
})
