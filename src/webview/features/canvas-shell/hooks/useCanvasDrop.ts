import { useEffect, useState } from 'react'
import { useStore } from '@/state/createStore'
import { GRID_SNAP } from '@/state/types'
import type { NodeShape } from '@/features/flowchart'
import { findEdgeInsertionCandidate } from '@/features/flowchart/application/edgeInsertion'

const validPaletteShapes = new Set<string>(['rectangle', 'rounded', 'pill', 'diamond', 'circle', 'hexagon', 'cylinder', 'subgraph'])

export function useCanvasDrop(screenToFlowPosition: (position: { x: number; y: number }) => { x: number; y: number }, snapToGrid = true) {
  const isLocked = useStore(state => state.isLocked)
  const addNode = useStore(state => state.addNode)
  const addSubgraph = useStore(state => state.addSubgraph)
  const addLane = useStore(state => state.addLane)
  const insertNodeOnEdge = useStore(state => state.insertNodeOnEdge)
  const nodes = useStore(state => state.nodes)
  const edges = useStore(state => state.edges)
  const pendingAddNode = useStore(state => state.pendingAddNode)
  const clearPendingAddNode = useStore(state => state.clearPendingAddNode)
  const snap = (position: { x: number; y: number }) => ({
    x: Math.round(position.x / GRID_SNAP) * GRID_SNAP,
    y: Math.round(position.y / GRID_SNAP) * GRID_SNAP,
  })
  const [edgeInsertionId, setEdgeInsertionId] = useState<string | null>(null)

  useEffect(() => {
    clearPendingAddNode()
  }, [clearPendingAddNode])
  useEffect(() => {
    if (!pendingAddNode) return
    const { shape, mermaidShape } = pendingAddNode
    clearPendingAddNode()
    const element = document.querySelector('.react-flow')
    const rect = element?.getBoundingClientRect()
    const center = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    const position = screenToFlowPosition(center)
    const placedPosition = snapToGrid ? snap(position) : position
    if (shape === 'subgraph') addSubgraph(placedPosition)
    else addNode({ id: crypto.randomUUID(), type: 'flowNode', position: placedPosition, data: { label: 'New Node', shape, ...(mermaidShape ? { mermaidShape } : {}) } })
  }, [addNode, addSubgraph, clearPendingAddNode, pendingAddNode, screenToFlowPosition, snapToGrid])

  const candidateAt = (position: { x: number; y: number }) => findEdgeInsertionCandidate(position, nodes, edges)
  function handleCanvasDragOver(event: React.DragEvent): void {
    event.preventDefault()
    if (!event.dataTransfer) { setEdgeInsertionId(null); return }
    event.dataTransfer.dropEffect = 'copy'
    if (isLocked || typeof event.dataTransfer.getData !== 'function') { setEdgeInsertionId(null); return }
    const raw = event.dataTransfer.getData('application/reactflow-palette')
    const generalized = raw.match(/^generalized:([a-z0-9-]+):(rectangle|rounded|pill|diamond|circle|hexagon|cylinder)$/)
    if (raw === 'lane' || raw === 'subgraph' || (!generalized && !validPaletteShapes.has(raw))) { setEdgeInsertionId(null); return }
    setEdgeInsertionId(candidateAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }))?.id ?? null)
  }
  function handleCanvasDrop(event: React.DragEvent): void {
    event.preventDefault()
    setEdgeInsertionId(null)
    if (isLocked) return
    const raw = event.dataTransfer?.getData?.('application/reactflow-palette')
    if (!raw) return
    const generalized = raw.match(/^generalized:([a-z0-9-]+):(rectangle|rounded|pill|diamond|circle|hexagon|cylinder)$/)
    if (!generalized && raw !== 'lane' && !validPaletteShapes.has(raw)) return
    const shape = (generalized?.[2] ?? raw) as NodeShape
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    const placedPosition = snapToGrid ? snap(position) : position
    if (raw === 'lane') addLane()
    else if (shape === 'subgraph') addSubgraph(placedPosition)
    else {
      const node = { id: crypto.randomUUID(), type: 'flowNode' as const, position: placedPosition, data: { label: 'New Node', shape, ...(generalized ? { mermaidShape: generalized[1] } : {}) } }
      const candidate = candidateAt(position)
      if (candidate) insertNodeOnEdge(candidate.id, node, true)
      else addNode(node)
    }
  }
  return { handleCanvasDragOver, handleCanvasDrop, edgeInsertionId }
}
