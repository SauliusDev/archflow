import type { NodeShape } from './types'

export type ShapeRenderer =
  | 'rectangle' | 'rounded' | 'pill' | 'diamond' | 'circle' | 'double-circle' | 'hexagon' | 'cylinder'
  | 'bang' | 'cloud' | 'triangle' | 'trapezoid' | 'trapezoid-inverted' | 'lean-right' | 'lean-left'
  | 'notch-rectangle' | 'lined-rectangle' | 'document' | 'stacked-document' | 'hourglass' | 'brace-left' | 'brace-right'
  | 'braces' | 'bolt' | 'horizontal-cylinder' | 'lined-cylinder' | 'curved-trapezoid' | 'divided-rectangle'
  | 'fork' | 'window-pane' | 'filled-circle' | 'tagged-document' | 'tagged-rectangle' | 'sloped-rectangle'
  | 'bow-tie' | 'note'

export interface ShapeDefinition {
  id: string
  label: string
  shape: NodeShape
  mermaidShape?: string
  renderer: ShapeRenderer
  kind?: 'node' | 'subgraph' | 'lane'
}

const legacy = (id: string, label: string, shape: NodeShape, renderer: ShapeRenderer): ShapeDefinition => ({ id, label, shape, renderer })
const generalized = (id: string, label: string, mermaidShape: string, renderer: ShapeRenderer, shape: NodeShape = 'rectangle'): ShapeDefinition => ({ id, label, shape, mermaidShape, renderer })

export const GENERAL_SHAPE_CATALOG: readonly ShapeDefinition[] = [
  legacy('general:rectangle', 'Rectangle', 'rectangle', 'rectangle'),
  legacy('general:rounded', 'Rounded', 'rounded', 'rounded'),
  legacy('general:stadium', 'Stadium', 'pill', 'pill'),
  legacy('general:decision', 'Decision', 'diamond', 'diamond'),
  legacy('general:circle', 'Circle', 'circle', 'circle'),
  legacy('general:hexagon', 'Hexagon', 'hexagon', 'hexagon'),
  legacy('general:cylinder', 'Cylinder', 'cylinder', 'cylinder'),
  generalized('general:bang', 'Bang', 'bang', 'bang'),
  generalized('general:cloud', 'Cloud', 'cloud', 'cloud'),
  generalized('general:triangle', 'Triangle', 'tri', 'triangle'),
  generalized('general:trapezoid', 'Trapezoid', 'trap-t', 'trapezoid'),
  generalized('general:inverted-trapezoid', 'Inverted trapezoid', 'trap-b', 'trapezoid-inverted'),
  generalized('general:lean-right', 'Lean right', 'lean-r', 'lean-right'),
  generalized('general:lean-left', 'Lean left', 'lean-l', 'lean-left'),
  generalized('general:notched-rectangle', 'Notched rectangle', 'notch-rect', 'notch-rectangle'),
  generalized('general:lined-rectangle', 'Lined rectangle', 'lin-rect', 'lined-rectangle'),
  generalized('general:document', 'Document', 'doc', 'document'),
  generalized('general:stacked-document', 'Stacked document', 'docs', 'stacked-document'),
  generalized('general:hourglass', 'Hourglass', 'hourglass', 'hourglass'),
  generalized('general:left-brace', 'Left brace', 'brace', 'brace-left'),
  generalized('general:right-brace', 'Right brace', 'brace-r', 'brace-right'),
  generalized('general:braces', 'Braces', 'braces', 'braces'),
  generalized('general:bolt', 'Bolt', 'bolt', 'bolt'),
  generalized('general:horizontal-cylinder', 'Horizontal cylinder', 'h-cyl', 'horizontal-cylinder', 'cylinder'),
  generalized('general:lined-cylinder', 'Lined cylinder', 'lin-cyl', 'lined-cylinder', 'cylinder'),
  generalized('general:curved-trapezoid', 'Curved trapezoid', 'curv-trap', 'curved-trapezoid'),
  generalized('general:divided-rectangle', 'Divided rectangle', 'div-rect', 'divided-rectangle'),
  generalized('general:fork', 'Fork', 'fork', 'fork'),
  generalized('general:window-pane', 'Window pane', 'win-pane', 'window-pane'),
  generalized('general:filled-circle', 'Filled circle', 'f-circ', 'filled-circle', 'circle'),
  generalized('general:tagged-document', 'Tagged document', 'tag-doc', 'tagged-document'),
  generalized('general:tagged-rectangle', 'Tagged rectangle', 'tag-rect', 'tagged-rectangle'),
  generalized('general:sloped-rectangle', 'Manual input', 'sl-rect', 'sloped-rectangle'),
  generalized('general:bow-tie', 'Stored data', 'bow-rect', 'bow-tie'),
  { id: 'general:subgraph', label: 'Subgraph', shape: 'subgraph', renderer: 'rectangle', kind: 'subgraph' },
  { id: 'general:swimlane', label: 'Swimlane', shape: 'subgraph', renderer: 'rectangle', kind: 'lane' },
]

export const ADVANCED_SHAPE_CATALOG: readonly ShapeDefinition[] = [
  generalized('advanced:note', 'Note', 'note', 'note'),
]

const allShapeDefinitions = [...GENERAL_SHAPE_CATALOG, ...ADVANCED_SHAPE_CATALOG]
const definitionsById = new Map(allShapeDefinitions.map(shape => [shape.id, shape]))
const definitionsByMermaidShape = new Map(allShapeDefinitions
  .filter((shape): shape is ShapeDefinition & { mermaidShape: string } => shape.mermaidShape !== undefined)
  .map(shape => [shape.mermaidShape, shape]))

export function getShapeDefinition(id: string): ShapeDefinition | undefined {
  return definitionsById.get(id)
}

export function getShapeDefinitionForNode(shape: NodeShape, mermaidShape?: string): ShapeDefinition | undefined {
  if (mermaidShape) {
    const generalizedDefinition = definitionsByMermaidShape.get(mermaidShape)
    if (generalizedDefinition) return generalizedDefinition
  }
  return allShapeDefinitions.find(definition => definition.shape === shape && !definition.mermaidShape)
}
