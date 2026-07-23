import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'

// All vi.mock() MUST be at top level — Vitest hoists them
vi.mock('@codemirror/view', () => {
  const dispatch = vi.fn()
  const destroy = vi.fn()
  const MockEditorView = vi.fn().mockImplementation(() => ({
    dispatch,
    destroy,
    state: {
      doc: { toString: () => 'graph TD\n  A[Test]' },
      selection: { main: { head: 0 } },
    },
  }))
  MockEditorView.editable = { of: vi.fn(() => []) }
  MockEditorView.updateListener = { of: vi.fn(() => []) }
  MockEditorView.theme = vi.fn(() => [])
  return {
    EditorView: MockEditorView,
    lineNumbers: vi.fn(() => []),
    highlightActiveLine: vi.fn(() => []),
    drawSelection: vi.fn(() => []),
  }
})

vi.mock('@codemirror/state', () => ({
  EditorState: {
    create: vi.fn().mockReturnValue({}),
  },
}))

vi.mock('@codemirror/language', () => ({
  StreamLanguage: { define: vi.fn(() => []) },
  HighlightStyle: { define: vi.fn(() => []) },
  syntaxHighlighting: vi.fn(() => []),
}))

vi.mock('@lezer/highlight', () => ({
  tags: {
    comment: 'comment',
    keyword: 'keyword',
    string: 'string',
    variableName: 'variableName',
    operator: 'operator',
    function: 'function',
  },
}))

vi.mock('@/state/createStore', () => ({
  useStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = { codeSource: 'graph TD\n  A[Test]', documentSession: null }
    return selector(state)
  }),
}))

vi.mock('@/lib/sync', () => ({
  useSyncCanvasToCode: vi.fn(),
  useSyncCodeToCanvas: vi.fn(() => vi.fn()),
}))

import CodePanel from './CodePanel'
import { useSyncCodeToCanvas } from '@/lib/sync'

describe('CodePanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders panel header with "CODE" title', () => {
    render(<CodePanel />)
    expect(screen.getByText('CODE')).toBeDefined()
  })

  it('renders status bar with initial "Ln 1, Col 1"', () => {
    render(<CodePanel />)
    expect(screen.getByText('Ln 1, Col 1')).toBeDefined()
  })

  it('renders "Mermaid" language indicator in status bar', () => {
    render(<CodePanel />)
    expect(screen.getByText('Mermaid')).toBeDefined()
  })

  it('renders a container div for CodeMirror (code-panel__body)', () => {
    const { container } = render(<CodePanel />)
    const body = container.querySelector('.code-panel__body')
    expect(body).not.toBeNull()
  })

  it('mounts EditorView on the container ref on first render', async () => {
    const { EditorView } = await import('@codemirror/view')
    render(<CodePanel />)
    expect(vi.mocked(EditorView)).toHaveBeenCalledTimes(1)
  })

  it('destroys EditorView on unmount', async () => {
    const { EditorView } = await import('@codemirror/view')
    const destroy = vi.fn()
    vi.mocked(EditorView).mockImplementationOnce(() => ({
      dispatch: vi.fn(),
      destroy,
      state: {
        doc: { toString: () => 'graph TD\n  A[Test]' },
        selection: { main: { head: 0 } },
      },
    }) as never)

    const { unmount } = render(<CodePanel />)
    unmount()
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('calls useSyncCanvasToCode with the view ref and canonical adapter source', async () => {
    const { useSyncCanvasToCode } = await import('@/lib/sync')
    render(<CodePanel />)
    expect(vi.mocked(useSyncCanvasToCode)).toHaveBeenCalled()
    const [refArg, codeArg] = vi.mocked(useSyncCanvasToCode).mock.calls[0]
    expect(refArg).toHaveProperty('current')
    expect(codeArg).toBe('graph TD\n  A[Test]')
  })

  it('editor is not read-only (EditorView.editable.of not called with false)', async () => {
    const { EditorView } = await import('@codemirror/view')
    render(<CodePanel />)
    const calls = vi.mocked(EditorView.editable.of).mock.calls
    expect(calls.every(([arg]) => arg !== false)).toBe(true)
  })

  it('calls useSyncCodeToCanvas on render', () => {
    render(<CodePanel />)
    expect(vi.mocked(useSyncCodeToCanvas)).toHaveBeenCalled()
  })

  it('CodePanel is a default export (required for React.lazy)', () => {
    expect(typeof CodePanel).toBe('function')
    expect(CodePanel.name).toBe('CodePanel')
  })

  it('renders the full code-panel structure with all sections', () => {
    const { container } = render(<CodePanel />)
    expect(container.querySelector('.code-panel')).not.toBeNull()
    expect(container.querySelector('.code-panel__header')).not.toBeNull()
    expect(container.querySelector('.code-panel__body')).not.toBeNull()
    expect(container.querySelector('.code-panel__statusbar')).not.toBeNull()
  })
})
