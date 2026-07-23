import React from 'react'
import type { NodeShape } from '../domain/types'
import { getShapeDefinitionForNode, type ShapeRenderer } from '../domain/shapeCatalog'

const FILL = 'var(--mv-node-fill)'
const STROKE = 'var(--mv-node-stroke)'
const SW = 1.5
const common = { fill: FILL, stroke: STROKE, strokeWidth: SW, vectorEffect: 'non-scaling-stroke' as const }

function graphic(renderer: ShapeRenderer): React.JSX.Element {
  switch (renderer) {
    case 'rounded': return <rect x="1" y="1" width="118" height="38" rx="8" {...common} />
    case 'pill': return <rect x="1" y="1" width="118" height="38" rx="20" {...common} />
    case 'diamond': return <polygon points="60,1 119,60 60,119 1,60" {...common} />
    case 'circle': return <circle cx="40" cy="40" r="39" {...common} />
    case 'double-circle': return <><circle cx="40" cy="40" r="39" {...common} /><circle cx="40" cy="40" r="31" {...common} fill="none" /></>
    case 'hexagon': return <polygon points="20,1 100,1 119,25 100,49 20,49 1,25" {...common} />
    case 'cylinder': return <><path d="M1 9C1 4 27 1 60 1s59 3 59 8v42c0 5-26 8-59 8S1 56 1 51V9Z" {...common} /><ellipse cx="60" cy="9" rx="59" ry="8" {...common} /></>
    case 'bang': return <path d="M16 1h88l15 19-15 19H16L1 20 16 1Z" {...common} />
    case 'cloud': return <path d="M27 38H94c15 0 22-18 10-28-8-7-20-5-25 2C69 0 49 5 46 18 29 14 17 24 20 34c1 3 4 4 7 4Z" {...common} />
    case 'triangle': return <polygon points="60,1 119,49 1,49" {...common} />
    case 'trapezoid': return <polygon points="20,1 100,1 119,49 1,49" {...common} />
    case 'trapezoid-inverted': return <polygon points="1,1 119,1 100,49 20,49" {...common} />
    case 'lean-right': return <polygon points="20,1 119,1 100,49 1,49" {...common} />
    case 'lean-left': return <polygon points="1,1 100,1 119,49 20,49" {...common} />
    case 'notch-rectangle': return <path d="M1 1h94l24 24v24H1V1Zm66 0v24h28" {...common} />
    case 'lined-rectangle': return <><rect x="1" y="1" width="118" height="48" {...common} /><path d="M13 1v48" {...common} fill="none" /></>
    case 'document': return <path d="M1 1h118v37c-14-10-28-10-42 0-14-10-28-10-42 0-12-8-23-8-34 0V1Z" {...common} />
    case 'stacked-document': return <><path d="M8 7h104v31c-12-8-24-8-36 0-12-8-24-8-36 0-11-8-22-8-32 0V7Z" {...common} /><path d="M1 1h104v31c-12-8-24-8-36 0-12-8-24-8-36 0-11-8-22-8-32 0V1Z" {...common} /></>
    case 'hourglass': return <path d="M1 1h118c0 16-21 17-38 24 17 7 38 8 38 24H1c0-16 21-17 38-24C22 18 1 17 1 1Z" {...common} />
    case 'brace-left': return <path d="M99 1C62 1 69 20 49 20 31 20 36 39 1 39M99 39C62 39 69 20 49 20" {...common} fill="none" />
    case 'brace-right': return <path d="M21 1c37 0 30 19 50 19 18 0 13 19 48 19M21 39c37 0 30-19 50-19" {...common} fill="none" />
    case 'braces': return <><path d="M59 1C31 1 36 20 1 20c35 0 30 19 58 19" {...common} fill="none" /><path d="M61 1c28 0 23 19 58 19-35 0-30 19-58 19" {...common} fill="none" /></>
    case 'bolt': return <path d="M67 1 18 29h34L45 49l57-32H68L67 1Z" {...common} />
    case 'horizontal-cylinder': return <><path d="M12 1h72c19 0 35 11 35 24S103 49 84 49H12C-3 49-3 1 12 1Z" {...common} /><ellipse cx="12" cy="25" rx="11" ry="24" {...common} /></>
    case 'lined-cylinder': return <><path d="M1 9C1 4 27 1 60 1s59 3 59 8v42c0 5-26 8-59 8S1 56 1 51V9Z" {...common} /><ellipse cx="60" cy="9" rx="59" ry="8" {...common} /><path d="M1 18c15 7 103 7 118 0" {...common} fill="none" /></>
    case 'curved-trapezoid': return <path d="M1 1h118c-8 13-8 34 0 48H1C9 35 9 14 1 1Z" {...common} />
    case 'divided-rectangle': return <><rect x="1" y="1" width="118" height="48" {...common} /><path d="M1 14h118" {...common} fill="none" /></>
    case 'fork': return <path d="M51 1h18v19h50v18H69v11H51V38H1V20h50V1Z" {...common} />
    case 'window-pane': return <><rect x="1" y="1" width="118" height="48" {...common} /><path d="M1 14h118M40 14v35M80 14v35" {...common} fill="none" /></>
    case 'filled-circle': return <circle cx="40" cy="40" r="39" {...common} />
    case 'tagged-document': return <path d="M1 1h118v37c-14-10-28-10-42 0-14-10-28-10-42 0-12-8-23-8-34 0V1Zm0 0 16 13h20" {...common} />
    case 'tagged-rectangle': return <path d="M1 1h118v48H1V1Zm0 0 16 13h22" {...common} />
    case 'sloped-rectangle': return <polygon points="1,12 119,1 119,49 1,49" {...common} />
    case 'bow-tie': return <path d="M1 1h118c-25 12-25 36 0 48H1C26 37 26 13 1 1Z" {...common} />
    case 'note': return <path d="M1 1h96l23 17v31H1V1Z" {...common} />
    case 'rectangle':
    default: return <rect x="1" y="1" width="118" height="38" {...common} />
  }
}

export interface ShapeGraphicProps {
  shape: NodeShape
  mermaidShape?: string
  className?: string
  preserveAspectRatio?: string
}

export function ShapeGraphic({ shape, mermaidShape, className = 'flow-node__svg', preserveAspectRatio = 'none' }: ShapeGraphicProps): React.JSX.Element {
  const definition = getShapeDefinitionForNode(shape, mermaidShape)
  const renderer = definition?.renderer ?? 'rectangle'
  const tall = renderer === 'diamond' || renderer === 'circle' || renderer === 'double-circle'
  const cylinder = renderer === 'cylinder' || renderer === 'lined-cylinder'
  const compact = renderer === 'rectangle' || renderer === 'rounded' || renderer === 'pill'
  return (
    <svg className={className} viewBox={tall ? '0 0 120 120' : cylinder ? '0 0 120 60' : compact ? '0 0 120 40' : '0 0 120 50'} preserveAspectRatio={preserveAspectRatio} aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
      {graphic(renderer)}
    </svg>
  )
}
