import type { MCSSApi } from '../../../shared/types'

export const api = (window as any).api as MCSSApi

export function call(method: string, params?: any) {
  return api.backend(method, params)
}
