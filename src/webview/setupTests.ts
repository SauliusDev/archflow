import { vi } from 'vitest'

// ── acquireVsCodeApi stub ──────────────────────────────────────────────────
// src/webview/vscode.ts calls acquireVsCodeApi() at module scope (line 4).
// This stub MUST be registered before any test module that transitively
// imports vscode.ts. setupFiles runs before each test file's imports.
;(globalThis as unknown as Record<string, unknown>).acquireVsCodeApi = () => ({
  postMessage: vi.fn(),
  getState: vi.fn(() => ({})),
  setState: vi.fn(),
})

// ── ResizeObserver stub ───────────────────────────────────────────────────
// React Flow uses ResizeObserver to detect container size changes.
globalThis.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// ── SVGElement.getBBox stub ───────────────────────────────────────────────
// React Flow calls getBBox() on SVG elements. jsdom does not implement it.
Object.defineProperty(SVGElement.prototype, 'getBBox', {
  writable: true,
  value: () => ({ x: 0, y: 0, width: 0, height: 0 }),
})

// ── offsetWidth / offsetHeight stubs ─────────────────────────────────────
// React Flow reads offsetWidth/offsetHeight to calculate container size.
// jsdom returns 0 by default; non-zero values prevent "no dimensions" warnings.
Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
  configurable: true,
  get: () => 300,
})
Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
  configurable: true,
  get: () => 200,
})

/**
 * Mocks @xyflow/react with lightweight React stubs.
 * Call this at the TOP LEVEL of any test file that renders <Canvas /> or <ReactFlow />.
 *
 * IMPORTANT: vi.mock() calls are hoisted by Vitest — this helper exists as a named
 * export for documentation, but the actual vi.mock() MUST be written at the top
 * level of each test file. See Canvas.test.tsx for the canonical example.
 *
 * The helper registers the global DOM stubs (above) which are needed even when
 * @xyflow/react is fully mocked.
 */
export function mockReactFlow(): void {
  // Intentionally empty — global stubs are registered above at module load time.
  // The actual @xyflow/react mock must be declared with vi.mock() in each test file.
  // This function serves as a documentation anchor and a call site in beforeEach
  // if additional per-test setup is added in the future.
}
