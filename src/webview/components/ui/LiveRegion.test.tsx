import React from 'react'
import { render, screen, act } from '@testing-library/react'
import { it, expect, vi, afterEach } from 'vitest'

vi.mock('zustand')

import LiveRegion from './LiveRegion'
import { useStore } from '@/state/createStore'

afterEach(() => {
  useStore.setState({ announcement: null })
  vi.restoreAllMocks()
})

it('renders sr-only status region', () => {
  render(<LiveRegion />)
  expect(screen.getByRole('status')).toBeTruthy()
})

it('shows announcement text when announcement is set', () => {
  render(<LiveRegion />)
  act(() => useStore.getState().announce('Node added'))
  expect(screen.getByRole('status').textContent).toBe('Node added')
})

it('clears announcement after 500ms', () => {
  vi.useFakeTimers()
  render(<LiveRegion />)
  act(() => useStore.getState().announce('Undo'))
  act(() => vi.advanceTimersByTime(600))
  expect(screen.getByRole('status').textContent).toBe('')
  vi.useRealTimers()
})

it('renders empty when announcement is null', () => {
  render(<LiveRegion />)
  expect(screen.getByRole('status').textContent).toBe('')
})
