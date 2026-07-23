import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CodePreviewFallback from './CodePreviewFallback'

vi.mock('@/features/import-export', () => ({
  CodePanel: () => <div data-testid="embedded-code-panel" />,
  PreviewPanel: () => <div data-testid="embedded-preview-panel" />,
}))

const restoreLastValidDiagram = vi.fn()
vi.mock('@/state/createStore', () => ({
  useStore: (selector: (state: { restoreLastValidDiagram: typeof restoreLastValidDiagram; recoverySnapshot: object }) => unknown) => selector({ restoreLastValidDiagram, recoverySnapshot: {} }),
}))

describe('CodePreviewFallback', () => {
  it('keeps the Canvas surface focused on the unavailable message', () => {
    render(<CodePreviewFallback family="flowchart" reason="Canvas unavailable: Node Database has ambiguous source syntax" />)

    expect(screen.getByRole('heading', { name: 'Canvas unavailable' })).toBeTruthy()
    expect(screen.getByText(/Node Database has ambiguous source syntax/)).toBeTruthy()
    expect(screen.queryByTestId('embedded-code-panel')).toBeNull()
    expect(screen.queryByTestId('embedded-preview-panel')).toBeNull()
  })

  it('offers recovery to the last valid diagram', () => {
    render(<CodePreviewFallback family="flowchart" />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore last valid diagram' }))
    expect(restoreLastValidDiagram).toHaveBeenCalledOnce()
  })
})
