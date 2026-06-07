import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'
import {
  devServerControlPlugin,
  projectFilePlugin,
  promptLibraryFilePlugin
} from './vite/plugins/promptcard-dev-storage'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), promptLibraryFilePlugin(), projectFilePlugin(), devServerControlPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    open: process.env.PROMPTCARD_DESKTOP_DEV === '1' ? false : true,
    proxy: {
      '/agent-health': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/agent-health/, '/health')
      },
      '/agent-api': {
        target: 'http://127.0.0.1:8001/api',
        changeOrigin: true,
        rewrite: (proxyPath) => proxyPath.replace(/^\/agent-api/, '')
      },
      '/storage-api': {
        target: 'http://127.0.0.1:8002/api',
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
    exclude: ['node_modules/**', 'dist/**', 'tests/e2e/**', 'agent-runtime/**']
  }
})
