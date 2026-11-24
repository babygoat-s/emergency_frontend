import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import mockApi from './mock/mock-api.js'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = {
    '/api': {
      target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
      changeOrigin: true,
      ws: true,
    },
  }
  return {
    plugins: mode === 'mock' ? [react(), mockApi()] : [react()],
    server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
    preview: { host: '0.0.0.0', port: 5173, strictPort: true, proxy },
  }
})
