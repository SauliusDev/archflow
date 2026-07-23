import { useEffect, useState } from 'react'
import type { ColorMode } from '@xyflow/react'

/**
 * Derives React Flow's colorMode from the app theme set on <html data-theme>.
 *
 * Why: React Flow's `colorMode="dark"` applies a `.dark` class whose
 * `.react-flow.dark` rules override our `--mv-canvas-bg` background. To make the
 * light theme actually paint a light canvas, colorMode must track the theme.
 *
 * Mapping:
 *   data-theme="light"           → 'light'
 *   data-theme="vscode-adaptive" → follows VS Code body class (vscode-light)
 *   (no attribute / dark)        → 'dark'
 */
function resolveColorMode(): ColorMode {
  const theme = document.documentElement.getAttribute('data-theme')
  if (theme === 'light') return 'light'
  if (theme === 'vscode-adaptive') {
    const body = document.body.classList
    const isLight = body.contains('vscode-light') || body.contains('vscode-high-contrast-light')
    return isLight ? 'light' : 'dark'
  }
  return 'dark'
}

export function useColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>(resolveColorMode)

  useEffect(() => {
    const update = (): void => setMode(resolveColorMode())
    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return mode
}
