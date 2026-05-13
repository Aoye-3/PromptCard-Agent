
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs/promises'
import type { Plugin } from 'vite'

const promptLibraryDataFile = path.resolve(__dirname, 'data', 'prompt-library-presets.json')

const sendJson = (res: any, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const readRequestBody = async (req: any): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const ensurePromptLibraryDataFile = async () => {
  await fs.mkdir(path.dirname(promptLibraryDataFile), { recursive: true })
  try {
    await fs.access(promptLibraryDataFile)
  } catch {
    await fs.writeFile(
      promptLibraryDataFile,
      JSON.stringify({ schemaVersion: 1, updatedAt: null, presets: [] }, null, 2),
      'utf8'
    )
  }
}

const isValidPresetList = (value: unknown) => {
  return Array.isArray(value) && value.every((preset) => {
    if (!preset || typeof preset !== 'object') return false
    const item = preset as Record<string, unknown>
    return (
      typeof item.id === 'string' &&
      typeof item.type === 'string' &&
      typeof item.category === 'string' &&
      typeof item.label === 'string' &&
      typeof item.content === 'string' &&
      typeof item.usageCount === 'number' &&
      item.meta !== null &&
      typeof item.meta === 'object'
    )
  })
}

const promptLibraryFilePlugin = (): Plugin => ({
  name: 'prompt-library-file-storage',
  configureServer(server) {
    server.middlewares.use('/__promptcard/presets', async (req, res) => {
      try {
        await ensurePromptLibraryDataFile()

        if (req.method === 'GET') {
          const raw = await fs.readFile(promptLibraryDataFile, 'utf8')
          return sendJson(res, 200, JSON.parse(raw))
        }

        if (req.method === 'PUT') {
          const body = JSON.parse(await readRequestBody(req))
          if (!isValidPresetList(body.presets)) {
            return sendJson(res, 400, { error: 'Invalid presets payload' })
          }

          const payload = {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            presets: body.presets
          }
          await fs.writeFile(promptLibraryDataFile, JSON.stringify(payload, null, 2), 'utf8')
          return sendJson(res, 200, payload)
        }

        return sendJson(res, 405, { error: 'Method not allowed' })
      } catch (error) {
        console.error('Prompt library file storage error:', error)
        return sendJson(res, 500, { error: 'Prompt library file storage failed' })
      }
    })
  }
})

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), promptLibraryFilePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'https://ark.cn-beijing.volces.com/api/coding/v3',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
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
  }
})
