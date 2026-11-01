import axios from 'axios'

export const api = axios.create({
  baseURL: '/api/v1',
  withCredentials: true,
  headers: { Accept: 'application/json' },
})

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(^|;\\s*)' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[2]) : null
}

let csrfRequest: Promise<unknown> | null = null

async function ensureCsrf() {
  if (!csrfRequest) {
    csrfRequest = axios
      .get('/sanctum/csrf-cookie', { withCredentials: true })
      .finally(() => {
        csrfRequest = null
      })
  }
  await csrfRequest
}

api.interceptors.request.use(async (config) => {
  const method = (config.method || 'get').toLowerCase()
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    await ensureCsrf()
    const token = readCookie('XSRF-TOKEN')
    if (token) {
      config.headers.set('X-XSRF-TOKEN', token)
    }
  }
  return config
})

export function apiError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const err = error as { response?: { status?: number; data?: any }; message?: string }
  const data = err?.response?.data
  if (data?.errors && typeof data.errors === 'object') {
    const first = Object.values(data.errors)[0]
    if (Array.isArray(first) && first.length) return String(first[0])
    if (typeof first === 'string') return first
  }
  if (data?.message) return String(data.message)
  if (err?.response?.status === 429) return 'Too many attempts. Please wait a moment and try again.'
  if (err?.response?.status === 401) return 'Please sign in to continue.'
  if (err?.response?.status === 403) return 'You do not have access to perform this action.'
  if (err?.response?.status === 404) return 'The requested item was not found.'
  if (err?.response?.status === 419) return 'Your session expired. Please refresh the page and try again.'
  return err?.message || fallback
}
