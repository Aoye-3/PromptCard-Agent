import fs from 'fs/promises'
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import type { Plugin } from 'vite'

const promptLibraryDataFile = path.resolve(__dirname, '..', '..', 'data', 'prompt-library-presets.json')
const projectsDataFile = path.resolve(__dirname, '..', '..', 'data', 'projects.json')

const sendJson = (res: ServerResponse, statusCode: number, payload: unknown) => {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

const readRequestBody = async (req: IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

const ensureJsonFile = async (filePath: string, emptyPayload: unknown) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  try {
    await fs.access(filePath)
  } catch {
    await fs.writeFile(filePath, JSON.stringify(emptyPayload, null, 2), 'utf8')
  }
}

export const isValidPresetList = (value: unknown) => {
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

export const isValidProjectList = (value: unknown) => {
  return Array.isArray(value) && value.every((project) => {
    if (!project || typeof project !== 'object') return false
    const item = project as Record<string, unknown>
    return (
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      (item.type === 'card' || item.type === 'storyboard' || item.type === 'three-stage') &&
      Array.isArray(item.pages) &&
      typeof item.currentPage === 'number' &&
      typeof item.createdAt === 'number' &&
      typeof item.updatedAt === 'number' &&
      typeof item.lastOpenedAt === 'number' &&
      item.meta !== null &&
      typeof item.meta === 'object'
    )
  })
}

export const promptLibraryFilePlugin = (): Plugin => ({
  name: 'prompt-library-file-storage',
  configureServer(server) {
    server.middlewares.use('/__promptcard/presets', async (req, res) => {
      try {
        await ensureJsonFile(promptLibraryDataFile, { schemaVersion: 1, updatedAt: null, presets: [] })

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

export const projectFilePlugin = (): Plugin => ({
  name: 'promptcard-project-file-storage',
  configureServer(server) {
    server.middlewares.use('/__promptcard/projects', async (req, res) => {
      try {
        await ensureJsonFile(projectsDataFile, { schemaVersion: 1, updatedAt: null, projects: [] })

        if (req.method === 'GET') {
          const raw = await fs.readFile(projectsDataFile, 'utf8')
          return sendJson(res, 200, JSON.parse(raw))
        }

        if (req.method === 'PUT') {
          const body = JSON.parse(await readRequestBody(req))
          if (!isValidProjectList(body.projects)) {
            return sendJson(res, 400, { error: 'Invalid projects payload' })
          }

          const payload = {
            schemaVersion: 1,
            updatedAt: new Date().toISOString(),
            projects: body.projects
          }
          await fs.writeFile(projectsDataFile, JSON.stringify(payload, null, 2), 'utf8')
          return sendJson(res, 200, payload)
        }

        return sendJson(res, 405, { error: 'Method not allowed' })
      } catch (error) {
        console.error('Project file storage error:', error)
        return sendJson(res, 500, { error: 'Project file storage failed' })
      }
    })
  }
})

export const devServerControlPlugin = (): Plugin => ({
  name: 'promptcard-dev-server-control',
  configureServer(server) {
    server.middlewares.use('/__promptcard/dev-server/shutdown', (req, res) => {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { error: 'Method not allowed' })
      }

      sendJson(res, 200, { ok: true })
      setTimeout(() => {
        server.close().finally(() => {
          process.exit(0)
        })
      }, 120)
    })
  }
})
