import { getShapeDefinition } from '../domain/shapeCatalog'

const STORAGE_KEY = 'flowforge.shape-scratchpad.v1'

function storage(): Storage | undefined {
  return typeof window === 'undefined' ? undefined : window.localStorage
}

export function readScratchpadShapeIds(): string[] {
  try {
    const raw = storage()?.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string' && getShapeDefinition(id) !== undefined))]
  } catch {
    return []
  }
}

export function addScratchpadShape(id: string): string[] {
  if (!getShapeDefinition(id)) return readScratchpadShapeIds()
  const next = [...new Set([...readScratchpadShapeIds(), id])]
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // The palette remains usable when webview storage is unavailable.
  }
  return next
}
