import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { timingSafeEqual } from 'node:crypto'
import { invokeAgent, type AgentRequest } from './agent-service.ts'

const host = process.env.PROMPTCARD_TEXT_AGENT_HOST || '127.0.0.1'
const port = Number(process.env.PROMPTCARD_TEXT_AGENT_PORT || 8011)
const MAX_REQUEST_BYTES = 45 * 1024 * 1024

createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    return sendJson(response, 200, {
      status: 'healthy',
      service: 'promptcard-pi-text-agent',
      orchestrator: 'pi'
    })
  }
  if (request.method !== 'POST' || request.url !== '/invoke') {
    return sendJson(response, 404, { detail: 'not_found' })
  }
  if (!validInternalToken(request)) {
    return sendJson(response, 401, { detail: 'invalid_internal_token' })
  }
  try {
    const body = await readJson(request) as AgentRequest
    const result = await invokeAgent(body)
    return sendJson(response, 200, result)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const status = message.startsWith('session_') ? 409 : 502
    return sendJson(response, status, { detail: message })
  }
}).listen(port, host, () => {
  console.log(`PromptCard pi text agent listening on http://${host}:${port}`)
})

function validInternalToken(request: IncomingMessage) {
  const expected = process.env.PROMPTCARD_INTERNAL_TOKEN
  const actual = request.headers['x-promptcard-internal-token']
  if (!expected || typeof actual !== 'string') return false
  const expectedBytes = Buffer.from(expected)
  const actualBytes = Buffer.from(actual)
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > MAX_REQUEST_BYTES) throw new Error('request_too_large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}
