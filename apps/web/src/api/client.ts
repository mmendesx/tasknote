import type { ApiErrorDetail } from '@tasknote/shared'

/**
 * ApiError — thrown by http<T> whenever response.ok is false.
 * Shape mirrors the NestJS global error filter: { error: { code, message, details? } }
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: unknown

  constructor(status: number, detail: ApiErrorDetail) {
    super(detail.message)
    this.name = 'ApiError'
    this.status = status
    this.code = detail.code
    this.details = detail.details
  }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

interface HttpInit {
  method?: HttpMethod
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

/**
 * Base typed fetch helper.
 *
 * Path rules:
 *   - Paths starting with "http" are used as-is (absolute URL).
 *   - All other paths are prefixed with "/api".
 *
 * Behaviour:
 *   - Sets Content-Type: application/json on POST / PATCH / PUT when body is present.
 *   - Serialises object body with JSON.stringify.
 *   - 204 No Content → resolves undefined.
 *   - Non-ok response → parses { error: {...} } and throws ApiError.
 */
export async function http<T = void>(path: string, init: HttpInit = {}): Promise<T> {
  const url = path.startsWith('http') ? path : `/api${path}`
  const method = init.method ?? 'GET'

  const headers: Record<string, string> = { ...init.headers }

  let body: BodyInit | undefined
  if (init.body !== undefined) {
    if (typeof init.body === 'string') {
      body = init.body
    } else {
      body = JSON.stringify(init.body)
      if (['POST', 'PATCH', 'PUT'].includes(method)) {
        headers['Content-Type'] = 'application/json'
      }
    }
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    signal: init.signal,
  })

  if (response.status === 204) {
    return undefined as T
  }

  if (!response.ok) {
    let detail: ApiErrorDetail = {
      code: 'UNKNOWN_ERROR',
      message: `Request failed with status ${response.status}`,
    }
    try {
      const payload = await response.json()
      if (payload?.error && typeof payload.error === 'object') {
        detail = payload.error as ApiErrorDetail
      }
    } catch {
      // ignore parse errors — keep default detail
    }
    throw new ApiError(response.status, detail)
  }

  return response.json() as Promise<T>
}
