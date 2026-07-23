import React from 'react'
import type { ClassRelationship } from '@/features/class-diagram'
import '@/styles/components/class-diagram.css'

type EdgeVisual = { marker: 'triangle' | 'diamond-filled' | 'diamond-open' | 'arrow' | 'none'; line: 'solid' | 'dashed' }

const visuals: Record<ClassRelationship['type'], EdgeVisual> = {
  inheritance: { marker: 'triangle', line: 'solid' },
  realization: { marker: 'triangle', line: 'dashed' },
  composition: { marker: 'diamond-filled', line: 'solid' },
  aggregation: { marker: 'diamond-open', line: 'solid' },
  association: { marker: 'arrow', line: 'solid' },
  dependency: { marker: 'arrow', line: 'dashed' },
  link: { marker: 'none', line: 'solid' },
}

function marker(marker: EdgeVisual['marker'], x: number, y: number): React.JSX.Element | null {
  if (marker === 'none') return null
  if (marker === 'triangle') return <path className="class-edge__marker" d={`M ${x} ${y} L ${x - 12} ${y - 7} L ${x - 12} ${y + 7} Z`} />
  if (marker === 'diamond-filled' || marker === 'diamond-open') return <path className={`class-edge__marker class-edge__marker--${marker}`} d={`M ${x} ${y} L ${x - 8} ${y - 6} L ${x - 16} ${y} L ${x - 8} ${y + 6} Z`} />
  return <path className="class-edge__marker" d={`M ${x} ${y} L ${x - 10} ${y - 6} M ${x} ${y} L ${x - 10} ${y + 6}`} />
}

export function ClassRelationshipEdge({
  relationship,
  source = { x: 0, y: 0 },
  target = { x: 200, y: 0 },
}: {
  relationship: ClassRelationship
  source?: { x: number; y: number }
  target?: { x: number; y: number }
}): React.JSX.Element {
  const visual = visuals[relationship.type]
  const middle = { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 }
  return (
    <g
      className={`class-diagram class-edge class-edge--${relationship.type}`}
      data-testid={`class-edge-${relationship.type}`}
      data-marker={visual.marker}
      data-line-style={visual.line}
      aria-label={`${relationship.type} from ${relationship.source} to ${relationship.target}`}
    >
      <path className={`class-edge__line class-edge__line--${visual.line}`} d={`M ${source.x} ${source.y} L ${target.x} ${target.y}`} />
      {marker(visual.marker, target.x, target.y)}
      {relationship.sourceCardinality && <text className="class-edge__cardinality" x={source.x + 8} y={source.y - 8}>{relationship.sourceCardinality}</text>}
      {relationship.targetCardinality && <text className="class-edge__cardinality" x={target.x - 8} y={target.y - 8}>{relationship.targetCardinality}</text>}
      {relationship.label && <text className="class-edge__label" x={middle.x} y={middle.y - 8} textAnchor="middle">{relationship.label}</text>}
    </g>
  )
}
