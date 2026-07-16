import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import {
  devServerControlPlugin,
  projectFilePlugin,
  promptLibraryFilePlugin
} from './vite/plugins/promptcard-dev-storage'

const frontendPort = Number(process.env.PROMPTCARD_FRONTEND_PORT || 3000)
const agentUrl = (process.env.PROMPTCARD_AGENT_URL || 'http://127.0.0.1:8001').replace(/\/$/, '')
const storageUrl = (process.env.PROMPTCARD_STORAGE_URL || 'http://127.0.0.1:8002').replace(/\/$/, '')

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), promptLibraryFilePlugin(), projectFilePlugin(), devServerControlPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: frontendPort,
    open: process.env.PROMPTCARD_DESKTOP_DEV === '1' ? false : true,
    watch: {
      ignored: [
        '**/agent-runtime/**',
        '**/.venv/**',
        '**/.uv-cache/**',
        '**/src-tauri/**',
        '**/logs/**',
        '**/data/**'
      ]
    },
    proxy: {
      '/agent-health': {
        target: agentUrl,
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/agent-health/, '/health')
      },
      '/storage-api/health': {
        target: storageUrl,
        changeOrigin: true,
        rewrite: () => '/health'
      },
      '/agent-api': {
        target: `${agentUrl}/api`,
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/agent-api/, '')
      },
      '/storage-api': {
        target: `${storageUrl}/api`,
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/storage-api/, '')
      },
      '/api': {
        target: 'https://ark.cn-beijing.volces.com/api/coding/v3',
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/api/, '')
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom', 'zustand'],
          utils: ['axios', 'localforage']
        }
      }
    }
  },
  test: {
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**', 'agent-runtime/**', '.tmp/**', '**/.pytest_cache/**']
  }
})
