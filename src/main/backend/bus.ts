import type { BackendEvent } from '../../shared/types'

type Listener = (ev: BackendEvent) => void

const listeners = new Set<Listener>()

export function onEvent(l: Listener): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function emit(ev: BackendEvent): void {
  for (const l of listeners) {
    try {
      l(ev)
    } catch {
      /* ignore */
    }
  }
}
