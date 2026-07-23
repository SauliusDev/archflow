import React from 'react'
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useColorMode } from './useColorMode'

function ColorModeProbe(): React.JSX.Element {
  return <output data-testid="color-mode">{useColorMode()}</output>
}

function setTheme(theme: string | null, bodyClass = ''): void {
  if (theme) document.documentElement.setAttribute('data-theme', theme)
  else document.documentElement.removeAttribute('data-theme')
  document.body.className = bodyClass
}

afterEach(() => {
  cleanup()
  setTheme(null)
})

describe('useColorMode', () => {
  it.each([
    ['dark', null, '', 'dark'],
    ['light', 'light', '', 'light'],
    ['adaptive light', 'vscode-adaptive', 'vscode-light', 'light'],
    ['adaptive dark', 'vscode-adaptive', 'vscode-dark', 'dark'],
    ['adaptive high-contrast light', 'vscode-adaptive', 'vscode-high-contrast-light', 'light'],
    ['adaptive high-contrast dark', 'vscode-adaptive', 'vscode-high-contrast', 'dark'],
  ])('resolves %s before observers attach', (_label, theme, bodyClass, expected) => {
    setTheme(theme, bodyClass)
    render(<ColorModeProbe />)
    expect(screen.getByTestId('color-mode').textContent).toBe(expected)
  })

  it('updates when the adaptive VS Code body class changes', async () => {
    setTheme('vscode-adaptive', 'vscode-dark')
    render(<ColorModeProbe />)
    expect(screen.getByTestId('color-mode').textContent).toBe('dark')

    await act(async () => {
      document.body.className = 'vscode-high-contrast-light'
    })
    expect(screen.getByTestId('color-mode').textContent).toBe('light')
  })

  it('keeps explicit selections independent from host class changes', async () => {
    setTheme('light', 'vscode-dark')
    render(<ColorModeProbe />)
    expect(screen.getByTestId('color-mode').textContent).toBe('light')

    await act(async () => {
      document.body.className = 'vscode-high-contrast'
    })
    expect(screen.getByTestId('color-mode').textContent).toBe('light')
  })
})
