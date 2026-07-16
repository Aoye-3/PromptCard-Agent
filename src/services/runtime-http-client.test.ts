import { describe, expect, it, vi } from 'vitest'
import { createRuntimeHttpClient, RuntimeHttpError } from './runtime-http-client'

describe('runtime http client', () => {
  it('sends credentials and the CSRF token for state-changing requests', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }))
    const request = createRuntimeHttpClient(fetcher, () => 'csrf-value')

    await request('/agent-api/promptcard/runtime/image-generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'apple' })
    })

    expect(fetcher).toHaveBeenCalledWith(
      '/agent-api/promptcard/runtime/image-generations',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.any(Headers)
      })
    )
    const headers = fetcher.mock.calls[0][1]?.headers as Headers
    expect(headers.get('X-CSRF-Token')).toBe('csrf-value')
    expect(headers.get('Content-Type')).toBe('application/json')
  })

  it('normalizes structured runtime errors without exposing the provider message', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: {
        code: 'rate_limited',
        message: 'provider secret response',
        action: 'unsafe provider action',
        retryable: true,
        field: 'prompt',
        runId: 'run-1'
      }
    }), { status: 429, headers: { 'Content-Type': 'application/json' } }))
    const request = createRuntimeHttpClient(fetcher, () => undefined)

    await expect(request('/runtime', { method: 'POST' })).rejects.toEqual(expect.objectContaining({
      name: 'RuntimeHttpError',
      code: 'rate_limited',
      retryable: true,
      field: 'prompt',
      runId: 'run-1'
    }))
    await request('/runtime', { method: 'POST' }).catch(error => {
      expect(error).toBeInstanceOf(RuntimeHttpError)
      expect(error.message).not.toContain('provider secret')
      expect(error).not.toHaveProperty('providerMessage')
    })
  })

  it('normalizes string detail responses from middleware', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      detail: 'CSRF validation failed'
    }), { status: 403, headers: { 'Content-Type': 'application/json' } }))
    const request = createRuntimeHttpClient(fetcher, () => undefined)

    await expect(request('/runtime', { method: 'POST' })).rejects.toMatchObject({
      code: 'csrf_validation_failed',
      retryable: false
    })
  })
})
