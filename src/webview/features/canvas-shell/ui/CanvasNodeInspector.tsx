import React, { useEffect, useState } from 'react'
import { useStore } from '@/state/createStore'
import { FILL_SWATCHES, type NodeShape } from '@/features/flowchart'
import {
  FormatAlignCenterIcon,
  FormatAlignLeftIcon,
  FormatAlignRightIcon,
  VerticalAlignBottomIcon,
  VerticalAlignCenterIcon,
  VerticalAlignTopIcon,
} from '@/components/icons'
import { ShapeGraphic } from '@/features/flowchart/ui/ShapeGraphic'

const SHAPES: Array<{ value: NodeShape; label: string }> = [
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'rounded', label: 'Rounded' },
  { value: 'pill', label: 'Pill' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'circle', label: 'Circle' },
  { value: 'hexagon', label: 'Hexagon' },
  { value: 'cylinder', label: 'Cylinder' },
]

const HORIZONTAL_ALIGNMENTS = ['left', 'center', 'right'] as const
const VERTICAL_ALIGNMENTS = ['top', 'center', 'bottom'] as const
const STROKE_WIDTHS = [1, 2, 3, 4, 6] as const

const HORIZONTAL_ALIGNMENT_ICONS = {
  left: FormatAlignLeftIcon,
  center: FormatAlignCenterIcon,
  right: FormatAlignRightIcon,
} as const

const VERTICAL_ALIGNMENT_ICONS = {
  top: VerticalAlignTopIcon,
  center: VerticalAlignCenterIcon,
  bottom: VerticalAlignBottomIcon,
} as const

interface LinkedColorInputProps {
  label: 'Fill' | 'Border' | 'Text'
  color?: string
  disabled: boolean
  onChange: (color: string) => void
}

function LinkedColorInput({ label, color, disabled, onChange }: LinkedColorInputProps): React.JSX.Element {
  const nativeColor = color ?? (label === 'Fill' ? '#ffffff' : '#000000')

  return (
    <label className="canvas-node-inspector__color-input">
      <span>{label}</span>
      <input aria-label={`${label} color`} type="color" value={nativeColor} disabled={disabled} onChange={event => onChange(event.currentTarget.value)} />
    </label>
  )
}

export default function CanvasNodeInspector(): React.JSX.Element | null {
  const nodes = useStore(state => state.nodes)
  const isLocked = useStore(state => state.isLocked)
  const updateNodeLabel = useStore(state => state.updateNodeLabel)
  const updateNodeColors = useStore(state => state.updateNodeColors)
  const updateNodeStrokeWidth = useStore(state => state.updateNodeStrokeWidth)
  const updateNodeTextAlignment = useStore(state => state.updateNodeTextAlignment)
  const updateNodeShape = useStore(state => state.updateNodeShape)
  const selectedNodes = nodes.filter(node => node.selected)
  const selectedNode = selectedNodes.length === 1 && !selectedNodes[0].data.isSubgraph ? selectedNodes[0] : undefined
  const [label, setLabel] = useState(selectedNode?.data.label ?? '')

  useEffect(() => {
    setLabel(selectedNode?.data.label ?? '')
  }, [selectedNode?.id, selectedNode?.data.label])

  if (!selectedNode) return null

  const { data, id } = selectedNode
  const horizontalAlignment = data.textHorizontalAlign ?? 'center'
  const verticalAlignment = data.textVerticalAlign ?? 'center'
  const colorEditingDisabled = isLocked
  const updateColor = (colors: { fillColor?: string; strokeColor?: string; textColor?: string }): void => {
    if (!colorEditingDisabled) updateNodeColors(id, colors)
  }
  const updateLinkedColors = (color: string): void => updateColor({ fillColor: color, strokeColor: color, textColor: color })
  const updateStrokeWidth = (strokeWidth: typeof STROKE_WIDTHS[number]): void => {
    if (!colorEditingDisabled) updateNodeStrokeWidth(id, strokeWidth)
  }

  return (
    <aside className="canvas-node-inspector" aria-label="Node inspector">
      <div className="canvas-node-inspector__header">
        <span>Node</span>
        <span className="canvas-node-inspector__node-id">{id}</span>
      </div>

      <label className="canvas-node-inspector__field">
        <span>Node text</span>
        <textarea aria-label="Node text" value={label} disabled={isLocked} rows={3} onChange={event => setLabel(event.currentTarget.value)} onBlur={() => updateNodeLabel(id, label)} />
      </label>

      <fieldset className="canvas-node-inspector__group">
        <legend>Shape</legend>
        <div className="canvas-node-inspector__shape-grid" role="group" aria-label="Node shape">
          {SHAPES.map(shape => (
            <button
              key={shape.value}
              type="button"
              className="canvas-node-inspector__shape-tile"
              aria-label={`Node shape ${shape.label}`}
              aria-pressed={data.shape === shape.value}
              title={shape.label}
              disabled={isLocked}
              onClick={() => updateNodeShape(id, shape.value)}
            >
              <ShapeGraphic shape={shape.value} className="canvas-node-inspector__shape-preview" preserveAspectRatio="xMidYMid meet" />
              <span>{shape.label}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="canvas-node-inspector__group">
        <legend>Horizontal text alignment</legend>
        <div className="canvas-node-inspector__button-row">
          {HORIZONTAL_ALIGNMENTS.map(alignment => {
            const Icon = HORIZONTAL_ALIGNMENT_ICONS[alignment]
            return <button key={alignment} type="button" aria-label={`Align text ${alignment}`} title={`Align text ${alignment}`} aria-pressed={horizontalAlignment === alignment} disabled={isLocked} onClick={() => updateNodeTextAlignment(id, { horizontal: alignment })}><Icon aria-hidden="true" /></button>
          })}
        </div>
      </fieldset>

      <fieldset className="canvas-node-inspector__group">
        <legend>Vertical text alignment</legend>
        <div className="canvas-node-inspector__button-row">
          {VERTICAL_ALIGNMENTS.map(alignment => {
            const Icon = VERTICAL_ALIGNMENT_ICONS[alignment]
            return <button key={alignment} type="button" aria-label={`Align text ${alignment}`} title={`Align text ${alignment}`} aria-pressed={verticalAlignment === alignment} disabled={isLocked} onClick={() => updateNodeTextAlignment(id, { vertical: alignment })}><Icon aria-hidden="true" /></button>
          })}
        </div>
      </fieldset>

      <div className="canvas-node-inspector__colors" aria-label="Node colors">
        <div className="canvas-node-inspector__linked-color-inputs" aria-label="Linked node color inputs">
          <LinkedColorInput label="Fill" color={data.fillColor} disabled={colorEditingDisabled} onChange={updateLinkedColors} />
          <LinkedColorInput label="Border" color={data.strokeColor} disabled={colorEditingDisabled} onChange={updateLinkedColors} />
          <LinkedColorInput label="Text" color={data.textColor} disabled={colorEditingDisabled} onChange={updateLinkedColors} />
        </div>
        <div className="canvas-node-inspector__swatches" role="group" aria-label="Linked color swatches">
          {FILL_SWATCHES.map(swatch => (
            <button key={swatch} className="canvas-node-inspector__swatch" type="button" style={{ backgroundColor: swatch }} aria-label={`Set all colors to ${swatch}`} aria-pressed={data.fillColor === swatch && data.strokeColor === swatch && data.textColor === swatch} title={swatch} disabled={colorEditingDisabled} onClick={() => updateLinkedColors(swatch)} />
          ))}
        </div>
        <div className="canvas-node-inspector__color-actions">
          <button type="button" aria-label="Clear fill color" disabled={colorEditingDisabled} onClick={() => updateColor({ fillColor: undefined })}>Clear fill</button>
          <button type="button" aria-label="Reset custom colors to default" disabled={colorEditingDisabled} onClick={() => updateColor({ fillColor: undefined, strokeColor: undefined, textColor: undefined })}>Reset colors</button>
        </div>
      </div>

      <label className="canvas-node-inspector__field">
        <span>Border width</span>
        <select aria-label="Border width" value={data.strokeWidth ?? 2} disabled={colorEditingDisabled} onChange={event => updateStrokeWidth(Number(event.currentTarget.value) as typeof STROKE_WIDTHS[number])}>
          {STROKE_WIDTHS.map(width => <option key={width} value={width}>{width} px</option>)}
        </select>
      </label>
    </aside>
  )
}
