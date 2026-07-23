import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// All vi.mock() MUST be at top level — Vitest hoists them
vi.mock('mermaid', () => ({
  default: {
    initialize: vi.fn(),
    render: vi.fn().mockResolvedValue({ svg: '<svg><g>test</g></svg>' }),
  },
}))

vi.mock('@/state/createStore', () => ({
  useStore: vi.fn((selector: (s: unknown) => unknown) => {
    const state = {
      codeSource: 'flowchart TD\n  A[Test]',
      documentSession: null,
    }
    return selector(state)
  }),
}))

type MockPreviewBarProps = {
  theme: string
  curve: string
  handDrawn: boolean
  onThemeChange: (theme: string) => void
  onCurveChange: (curve: string) => void
  onHandDrawnToggle: () => void
}

const mockPreviewBarBag: Partial<MockPreviewBarProps> = {}
vi.mock('./PreviewBar', () => ({
  default: (props: MockPreviewBarProps) => {
    Object.assign(mockPreviewBarBag, props)
    return null
  },
}))

import mermaid from 'mermaid'
import PreviewPanel from './PreviewPanel'
import { useStore } from '@/state/createStore'

const flowchartPreviewFixtures = import.meta.glob<string>(
  '../../../../../test/fixtures/mermaid-docs/flowchart/examples/*.mmd',
  { eager: true, query: '?raw', import: 'default' },
)

describe('PreviewPanel', () => {
  beforeEach(() => {
    vi.mocked(mermaid).render = vi.fn().mockResolvedValue({ svg: '<svg><g>test</g></svg>' })
    vi.mocked(useStore).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ codeSource: 'flowchart TD\n  A[Test]', documentSession: null })
    )
  })

  afterEach(() => {
    vi.mocked(mermaid).render.mockReset()
  })

  it('renders PREVIEW header', () => {
    render(<PreviewPanel />)
    expect(screen.getByText('PREVIEW')).toBeDefined()
  })

  it('calls mermaid.initialize at module load', () => {
    // initialize is called at module scope AND inside useEffect — assert call shape, not count
    expect(vi.mocked(mermaid).initialize).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false })
    )
  })

  it('calls mermaid.render on mount with canonical adapter source', async () => {
    await act(async () => {
      render(<PreviewPanel />)
    })
    expect(vi.mocked(mermaid).render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-svg-/),
      'flowchart TD\n  A[Test]'
    )
  })

  it('updates SVG container innerHTML on successful render', async () => {
    vi.mocked(mermaid).render = vi.fn().mockResolvedValue({ svg: '<svg id="test">test</svg>' })
    let container!: HTMLElement
    await act(async () => {
      const result = render(<PreviewPanel />)
      container = result.container
    })
    const svgContainer = container.querySelector('.preview-panel__svg-container')
    expect(svgContainer?.innerHTML).toContain('<svg')
  })

  it('does not crash on mermaid.render rejection', async () => {
    vi.mocked(mermaid).render = vi.fn().mockRejectedValue(new Error('parse error'))
    await expect(
      act(async () => {
        render(<PreviewPanel />)
      })
    ).resolves.not.toThrow()
    const status = await screen.findByRole('status')
    expect(status.textContent).toContain('parse error')
    expect(status.getAttribute('data-revision')).toBe('0')
  })

  it('re-renders when canonical source changes', async () => {
    vi.mocked(useStore).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ codeSource: 'flowchart TD\n  A[Test]', documentSession: null })
    )

    let rerender!: ReturnType<typeof render>['rerender']
    await act(async () => {
      const result = render(<PreviewPanel />)
      rerender = result.rerender
    })

    // Simulate an adapter-backed source revision.
    vi.mocked(useStore).mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ codeSource: 'flowchart TD\n  B[Updated]', documentSession: null })
    )

    await act(async () => {
      rerender(<PreviewPanel />)
    })

    expect(vi.mocked(mermaid).render).toHaveBeenCalledTimes(2)
  })

  it('re-renders with direction applied in code', async () => {
    await act(async () => { render(<PreviewPanel />) })
    vi.mocked(mermaid).render.mockClear()

    await act(async () => {
      mockPreviewBarBag.onDirectionChange('LR')
    })

    expect(vi.mocked(mermaid).render).toHaveBeenCalledWith(
      expect.stringMatching(/^mermaid-svg-/),
      'flowchart LR\n  A[Test]'
    )
  })

  it('passes theme to mermaid.initialize inside useEffect', async () => {
    await act(async () => {
      render(<PreviewPanel />)
    })
    expect(vi.mocked(mermaid).initialize).toHaveBeenCalledWith(
      expect.objectContaining({ theme: 'dark' })
    )
  })

  it('sends every accepted pinned flowchart fixture to Mermaid Preview unchanged', async () => {
    expect(Object.keys(flowchartPreviewFixtures)).toHaveLength(110)
    for (const fixture of Object.values(flowchartPreviewFixtures)) {
      vi.mocked(useStore).mockImplementation((selector: (s: unknown) => unknown) =>
        selector({ codeSource: fixture, documentSession: null })
      )
      let view!: ReturnType<typeof render>
      await act(async () => { view = render(<PreviewPanel />) })
      view.unmount()
    }
    expect(vi.mocked(mermaid).render).toHaveBeenCalledTimes(110)
    expect(vi.mocked(mermaid).render.mock.calls.map(([, source]) => source).sort())
      .toEqual(Object.values(flowchartPreviewFixtures)
        .map(source => source.replace(/^(flowchart|graph)\s+\w+/m, 'flowchart TD'))
        .sort())
  })
})
