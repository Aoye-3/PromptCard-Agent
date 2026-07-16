export interface RuntimeErrorEnvelope {
  code: string
  retryable: boolean
  field?: string
  runId?: string
}

export class RuntimeHttpError extends Error implements RuntimeErrorEnvelope {
  code: string
  retryable: boolean
  field?: string
  runId?: string

  constructor(detail: RuntimeErrorEnvelope) {
    super(detail.code)
    this.name = 'RuntimeHttpError'
    this.code = detail.code
    this.retryable = detail.retryable
    this.field = detail.field
    this.runId = detail.runId
  }
}

type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
type CsrfTokenReader = () => string | undefined

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export const createRuntimeHttpClient = (
  fetchImplementation: FetchImplementation = (...args) => globalThis.fetch(...args),
  readCsrfToken: CsrfTokenReader = () => readCookie('csrf_token')
) => async <T>(url: string, init: RequestInit = {}): Promise<T> => {
  const method = String(init.method || 'GET').toUpperCase()
  const headers = new Headers(init.headers)
  if (!headers.has('Accept')) headers.set('Accept', 'application/json')
  if (init.body != null && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (STATE_CHANGING_METHODS.has(method)) {
    const csrfToken = readCsrfToken()
    if (csrfToken) headers.set('X-CSRF-Token', csrfToken)
  }

  let response: Response
  try {
    response = await fetchImplementation(url, {
      ...init,
      ...(init.method ? { method } : {}),
      headers,
      credentials: 'include'
    })
  } catch {
    throw new RuntimeHttpError({ code: 'service_unavailable', retryable: true })
  }

  const payload = response.status === 204
    ? null
    : await response.json().catch(() => null) as unknown
  if (!response.ok) throw new RuntimeHttpError(normalizeRuntimeError(payload, response.status))
  return payload as T
}

export const runtimeHttpRequest = createRuntimeHttpClient()

const normalizeRuntimeError = (payload: unknown, status: number): RuntimeErrorEnvelope => {
  const root = isRecord(payload) ? payload : {}
  const detail = root.detail
  if (typeof detail === 'string') {
    return {
      code: status === 403 && /csrf/i.test(detail) ? 'csrf_validation_failed' : fallbackCode(status),
      retryable: false
    }
  }
  const record = isRecord(detail) ? detail : isRecord(payload) ? payload : {}
  return {
    code: safeErrorIdentifier(record.code, fallbackCode(status)),
    retryable: record.retryable === true,
    ...(safeErrorIdentifier(record.field) ? { field: safeErrorIdentifier(record.field) } : {}),
    ...(isLocalIdentifier(record.runId) ? { runId: record.runId } : {})
  }
}

const fallbackCode = (status: number): string => {
  if (status === 401) return 'authentication_failed'
  if (status === 403) return 'request_forbidden'
  if (status === 429) return 'rate_limited'
  if (status >= 500) return 'service_unavailable'
  return 'runtime_request_failed'
}

const readCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined
  const prefix = `${name}=`
  return document.cookie
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(prefix))
    ?.slice(prefix.length)
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object')
const safeErrorIdentifier = (value: unknown, fallback = ''): string => (
  typeof value === 'string' && /^[a-z][a-z0-9_]{0,63}$/.test(value) ? value : fallback
)
const isLocalIdentifier = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Za-z0-9._:-]{1,160}$/.test(value) && !value.includes('://')
)
