/**
 * Zustand test mock — replaces `create` with a version that tracks all store
 * instances and resets them to their initial state after each test.
 *
 * NOTE: For Vitest to resolve this file as a manual mock for the `zustand`
 * node_module, `vi.mock('zustand')` requires the mock to be in
 * `<project-root>/__mocks__/zustand.ts` (adjacent to node_modules).
 * This file at `src/webview/__mocks__/zustand.ts` is NOT auto-resolved by
 * Vitest for node_module mocks. The canonical mock is at `__mocks__/zustand.ts`.
 *
 * Supports both Zustand v5 forms:
 *   - Direct:  create<T>(initializer)
 *   - Curried: create<T>()(initializer)  ← required for TypeScript inference in v5
 *
 * Usage in test files:
 *   vi.mock('zustand')  ← call at top level (hoisted by Vitest)
 */
import { afterEach, afterAll } from 'vitest'
import { create as actualCreate } from 'zustand'
import type { StateCreator, StoreApi, UseBoundStore } from 'zustand'

// Re-export everything from actual zustand so non-create imports still work
export * from 'zustand'

// Cast to a single-overload form to avoid TS picking the curried overload.
type DirectCreate = <T>(initializer: StateCreator<T, [], []>) => UseBoundStore<StoreApi<T>>
const createStore = actualCreate as unknown as DirectCreate

const storeResetFns = new Set<() => void>()

function registerStore<T>(store: UseBoundStore<StoreApi<T>>): UseBoundStore<StoreApi<T>> {
  const initialState = store.getState() as Record<string, unknown>
  storeResetFns.add(() => {
    const reset = Object.fromEntries(
      Object.entries(initialState).map(([key, val]) => [
        key,
        typeof val === 'function' ? val : structuredClone(val),
      ])
    )
    store.setState(reset as T, true)
  })
  return store
}

// This export shadows the `create` re-exported by `export * from 'zustand'` above.
// TypeScript resolves local named exports with higher priority than star re-exports.
//
// Handles both:
//   create(initializer)     — direct form (v4 compatible)
//   create()(initializer)   — curried form (v5 TypeScript inference form)
export function create<T>(initializer: StateCreator<T, [], []>): UseBoundStore<StoreApi<T>>
export function create<T>(): (initializer: StateCreator<T, [], []>) => UseBoundStore<StoreApi<T>>
export function create<T>(initializer?: StateCreator<T, [], []>) {
  if (initializer === undefined) {
    return (fn: StateCreator<T, [], []>) => registerStore(createStore(fn))
  }
  return registerStore(createStore(initializer))
}

afterEach(() => {
  storeResetFns.forEach((reset) => reset())
})

afterAll(() => {
  storeResetFns.clear()
})
