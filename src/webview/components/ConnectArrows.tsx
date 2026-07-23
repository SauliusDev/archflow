import React from 'react'
import { useStore } from '@/state/createStore'

interface ConnectArrowsProps {
  isVisible: boolean
  nodeId: string
}

const DIRECTIONS = [
  { dir: 'top',    icon: '▲', title: 'Connect top'    },
  { dir: 'right',  icon: '▶', title: 'Connect right'  },
  { dir: 'bottom', icon: '▼', title: 'Connect bottom' },
  { dir: 'left',   icon: '◀', title: 'Connect left'   },
] as const

export default function ConnectArrows({ isVisible, nodeId }: ConnectArrowsProps): React.JSX.Element | null {
  const setPendingConnect = useStore(s => s.setPendingConnect)

  if (!isVisible) return null

  return (
    <div className="connect-arrows" data-nodeid={nodeId}>
      {DIRECTIONS.map(({ dir, icon, title }) => (
        <button
          key={dir}
          data-testid={dir}
          className={`connect-arrow connect-arrow--${dir}`}
          aria-label={title}
          title={title}
          type="button"
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setPendingConnect({ kind: 'new', sourceId: nodeId, sourceSide: dir })
          }}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}
