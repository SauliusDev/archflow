import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSyncCodeToCanvas } from './sync'
import { useStore } from '@/state/createStore'
import { classAdapter } from '@/features/class-diagram'
import { createDocumentSession } from './documentSession'
import type { LayoutStateV2 } from '../../shared/diagram-contracts'

const source = 'classDiagram\nclass Account {\n  -String owner\n}\n'
const layout: LayoutStateV2 = { version: 2, diagramFamily: 'class', viewport: { x: 0, y: 0, zoom: 1 }, elements: { 'class:Account': { x: 120, y: 80, width: 220, height: 160 } }, edges: {}, constraints: [] }

function initialize(): void {
  useStore.getState().initializeDocumentSession(createDocumentSession('class-sync', 1, classAdapter.parse(source, 1), layout))
}

function update(content: string) {
  return { docChanged: true, view: { state: { doc: { toString: () => content } } } }
}

describe('class code-to-canvas sync', () => {
  beforeEach(() => { vi.useFakeTimers(); initialize() })
  afterEach(() => { vi.useRealTimers(); vi.clearAllMocks() })

  it('debounces valid source and preserves geometry for unchanged class identifiers', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => result.current(update('classDiagram\nclass Account {\n  -String holder\n}\n') as never))
    expect(useStore.getState().classDiagram?.classes[0].attributes[0].name).toBe('owner')

    act(() => vi.advanceTimersByTime(300))
    expect(useStore.getState().classDiagram?.classes[0].attributes[0].name).toBe('holder')
    expect(useStore.getState().documentSession?.layout.elements['class:Account']).toEqual(layout.elements['class:Account'])
  })

  it('rejects invalid source and ignores code updates while a drag owns synchronization', () => {
    const { result } = renderHook(() => useSyncCodeToCanvas())
    act(() => result.current(update('classDiagram\nclass `Unsupported`\n') as never))
    act(() => vi.advanceTimersByTime(300))
    expect(useStore.getState().documentSession?.source).toBe(source)

    useStore.getState().setSyncDirection('canvas')
    act(() => result.current(update('classDiagram\nclass Account\n') as never))
    act(() => vi.advanceTimersByTime(300))
    expect(useStore.getState().documentSession?.source).toBe(source)
  })
})
