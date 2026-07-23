import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

vi.mock('zustand')

import ConnectArrows from './ConnectArrows'
import { useStore } from '@/state/createStore'
import { mockReactFlow } from '../setupTests'

mockReactFlow()

describe('ConnectArrows', () => {
  const mockSetPendingConnect = vi.fn()

  beforeEach(() => {
    useStore.setState({ setPendingConnect: mockSetPendingConnect } as never)
    mockSetPendingConnect.mockClear()
  })

  it('renders 4 direction buttons when visible', () => {
    render(<ConnectArrows isVisible={true} nodeId="node-1" />)
    expect(screen.getByTestId('top')).toBeTruthy()
    expect(screen.getByTestId('right')).toBeTruthy()
    expect(screen.getByTestId('bottom')).toBeTruthy()
    expect(screen.getByTestId('left')).toBeTruthy()
  })

  it('returns null when not visible', () => {
    const { container } = render(<ConnectArrows isVisible={false} nodeId="node-1" />)
    expect(container.firstChild).toBeNull()
  })

  it('starts the pending connection from the dragged arrow side', () => {
    render(<ConnectArrows isVisible={true} nodeId="node-1" />)
    const btn = screen.getByTestId('right')
    fireEvent.pointerDown(btn)
    expect(mockSetPendingConnect).toHaveBeenCalledWith({ kind: 'new', sourceId: 'node-1', sourceSide: 'right' })
  })

  it.each([
    ['top', 'Connect top'],
    ['right', 'Connect right'],
    ['bottom', 'Connect bottom'],
    ['left', 'Connect left'],
  ])('gives the %s arrow an accessible name and native hover hint', (direction, name) => {
    render(<ConnectArrows isVisible={true} nodeId="node-1" />)
    const button = screen.getByRole('button', { name })
    expect(button.getAttribute('data-testid')).toBe(direction)
    expect(button.getAttribute('title')).toBe(name)
  })
})
