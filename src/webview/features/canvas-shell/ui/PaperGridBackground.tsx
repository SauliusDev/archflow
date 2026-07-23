import React from 'react'
import { useViewport } from '@xyflow/react'
import type { ColorMode } from '@xyflow/react'

const MINOR_GAP = 44
const MAJOR_GAP = MINOR_GAP * 5

function modulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}

export function PaperGridBackground({ colorMode }: { colorMode: ColorMode }): React.JSX.Element {
  const { x, y, zoom } = useViewport()
  const minorGap = MINOR_GAP * zoom
  const majorGap = MAJOR_GAP * zoom
  const minorColor = colorMode === 'dark' ? 'rgba(255, 255, 255, 0.018)' : 'rgba(36, 36, 36, 0.04)'
  const majorColor = colorMode === 'dark' ? 'rgba(255, 255, 255, 0.035)' : 'rgba(36, 36, 36, 0.05)'
  const minorLineWidth = 1
  const minorLines = [1, 2, 3, 4].flatMap(index => {
    const offset = index * minorGap
    return [`M ${offset} 0 V ${majorGap}`, `M 0 ${offset} H ${majorGap}`]
  }).join(' ')

  return <svg
    aria-hidden="true"
    className="react-flow__background workflow-paper-grid"
    data-testid="paper-grid-background"
    style={{ position: 'absolute', width: '100%', height: '100%', top: 0, left: 0, pointerEvents: 'none' }}
  >
    <pattern
      id="workflow-paper-grid-pattern"
      x="0"
      y="0"
      width={majorGap}
      height={majorGap}
      patternTransform={`translate(${modulo(x, majorGap)}, ${modulo(y, majorGap)})`}
      patternUnits="userSpaceOnUse"
    >
      <path d={minorLines} fill="none" stroke={minorColor} strokeWidth={minorLineWidth} />
      <path d={`M 0 0 V ${majorGap} M 0 0 H ${majorGap}`} fill="none" stroke={majorColor} strokeWidth="1" />
    </pattern>
    <rect width="100%" height="100%" fill="url(#workflow-paper-grid-pattern)" />
  </svg>
}
