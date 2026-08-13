import type { MCSSApi, RequestMap } from '../../shared/types'

declare global {
  interface Window {
    api: MCSSApi
  }
}

export const api = window.api

export function call<K extends keyof RequestMap>(method: K, params?: RequestMap[K]['params']) {
  return api.backend(method, params)
}
