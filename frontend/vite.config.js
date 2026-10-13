import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const frontendEnv = loadEnv(mode, process.cwd(), '')
  const backendEnv = loadEnv(mode, resolve(process.cwd(), '../backend'), 'TOSS_PAYMENTS_')
  const tossPaymentsClientKey = frontendEnv.VITE_TOSS_PAYMENTS_CLIENT_KEY || backendEnv.TOSS_PAYMENTS_CLIENT_KEY || ''

  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_TOSS_PAYMENTS_CLIENT_KEY': JSON.stringify(tossPaymentsClientKey),
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:54321',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '/functions/v1/api'),
        },
      },
    },
  }
})
