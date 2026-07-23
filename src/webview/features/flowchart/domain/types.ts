export type NodeShape = 'rectangle' | 'rounded' | 'pill' | 'diamond' | 'circle' | 'hexagon' | 'cylinder' | 'subgraph'

export type EdgeStyle = 'arrow' | 'dotted' | 'thick' | 'open'

export type FlowchartOwnership = 'editable' | 'represented' | 'preserved-only'

export type FlowchartSemanticOperation =
  | { kind: 'rename-node'; id: string; label: string }
  | { kind: 'add-node'; id: string; label: string; shape?: Exclude<NodeShape, 'subgraph'>; mermaidShape?: string }
  | { kind: 'delete-node'; id: string }
  | { kind: 'update-node-shape'; id: string; shape: Exclude<NodeShape, 'subgraph'> }
  | { kind: 'update-node-colors'; id: string; fillColor?: string; strokeColor?: string; strokeWidth?: number; textColor?: string }
  | { kind: 'add-edge'; id: string; source: string; target: string; label?: string; style?: EdgeStyle }
  | { kind: 'delete-edge'; id: string }
  | { kind: 'update-edge'; id: string; label?: string; style?: EdgeStyle; source?: string; target?: string }
  | { kind: 'add-subgraph'; id: string; label: string }
  | { kind: 'rename-subgraph'; id: string; label: string }
  | { kind: 'move-node-to-subgraph'; id: string; subgraphId: string | null }
  | { kind: 'delete-subgraph'; id: string; disposition: 'promote' | 'delete-contents' }
  | { kind: 'set-subgraph-direction'; id: string; direction: 'TB' | 'TD' | 'BT' | 'RL' | 'LR' }
  | { kind: 'reorder-top-level-subgraph'; id: string; beforeId: string }
