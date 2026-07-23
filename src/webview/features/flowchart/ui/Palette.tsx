import React, { useState, useRef, useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '@/state/createStore'
import { ADVANCED_SHAPE_CATALOG, GENERAL_SHAPE_CATALOG, getShapeDefinition, type ShapeDefinition } from '../domain/shapeCatalog'
import { readScratchpadShapeIds, removeScratchpadShape } from '../state/scratchpadShapes'
import { ShapeGraphic } from './ShapeGraphic'

interface ClassPaletteItem {
  family: 'class'
  label: 'Class'
}

type PaletteItem = ShapeDefinition | ClassPaletteItem

const CLASS_PALETTE_ITEMS: ClassPaletteItem[] = [{ family: 'class', label: 'Class' }]

export interface PaletteProps {
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

function isClassPaletteItem(item: PaletteItem): item is ClassPaletteItem {
  return 'family' in item
}

function ShapeSection({
  title,
  items,
  onSelect,
  onDragStart,
  onRemove,
}: {
  title: string
  items: readonly ShapeDefinition[]
  onSelect: (item: ShapeDefinition) => void
  onDragStart: (event: React.DragEvent, item: ShapeDefinition) => void
  onRemove?: (item: ShapeDefinition) => void
}): React.JSX.Element {
  const headingId = `shape-section-${title.toLowerCase()}`
  return (
    <section className="component-palette__section" aria-labelledby={headingId}>
      <h2 className="component-palette__category" id={headingId}>{title}</h2>
      {items.length ? <div className="component-palette__grid">
        {items.map(item => <div key={item.id} className="component-palette__item-wrap">
          <button
              type="button"
              className="component-palette__item"
              draggable
              aria-label={item.label}
              onDragStart={event => onDragStart(event, item)}
              onClick={() => onSelect(item)}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  onSelect(item)
                }
              }}
            >
              <ShapeGraphic shape={item.shape} mermaidShape={item.mermaidShape} className="component-palette__shape-preview" />
              <span className="component-palette__item-label">{item.label}</span>
            </button>
          {onRemove && <button type="button" className="component-palette__remove" aria-label={`Remove ${item.label} from Scratchpad`} title="Remove from Scratchpad" onClick={() => onRemove(item)}>✕</button>}
        </div>)}
      </div> : <p className="component-palette__empty component-palette__empty--scratchpad">Save any shape from its node toolbar to reuse it here.</p>}
    </section>
  )
}

export default function Palette({ onClose, triggerRef }: PaletteProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [scratchpadIds, setScratchpadIds] = useState(readScratchpadShapeIds)
  const paletteRef = useRef<HTMLDivElement>(null)
  const nodes = useStore(s => s.nodes)
  const documentFamily = useStore(s => s.documentSession?.family)
  const classDiagram = useStore(s => s.classDiagram)
  const { addNode, addSubgraph, addLane, applyClassOperation } = useStore(
    useShallow(s => ({ addNode: s.addNode, addSubgraph: s.addSubgraph, addLane: s.addLane, applyClassOperation: s.applyClassOperation }))
  )

  useEffect(() => {
    function handleOutside(event: MouseEvent): void {
      if (paletteRef.current?.contains(event.target as Node) || triggerRef.current?.contains(event.target as Node)) return
      onClose()
    }
    function handleEscape(event: KeyboardEvent): void {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [onClose, triggerRef])

  function handleDragStart(event: React.DragEvent, item: ShapeDefinition): void {
    const payload = item.kind === 'lane'
      ? 'lane'
      : item.mermaidShape
        ? `generalized:${item.mermaidShape}:${item.shape}`
        : item.shape
    event.dataTransfer.setData('application/reactflow-palette', payload)
    event.dataTransfer.effectAllowed = 'copy'
  }

  function handleShapeClick(item: PaletteItem): void {
    if (isClassPaletteItem(item)) {
      const classIds = new Set(classDiagram?.classes.map(definition => definition.id) ?? [])
      let suffix = 1
      let id = 'Class'
      while (classIds.has(id)) id = `Class${++suffix}`
      applyClassOperation({ kind: 'add-class', id })
    } else if (item.kind === 'lane') {
      addLane()
    } else if (item.kind === 'subgraph') {
      addSubgraph()
    } else {
      const position = { x: 60 + nodes.length * 30, y: 60 + nodes.length * 30 }
      addNode({
        id: crypto.randomUUID(),
        type: 'flowNode',
        position,
        data: { label: item.label, shape: item.shape, ...(item.mermaidShape ? { mermaidShape: item.mermaidShape } : {}) },
      })
    }
    triggerRef.current?.focus()
    onClose()
  }

  const matchesQuery = (item: ShapeDefinition): boolean => item.label.toLowerCase().includes(query.toLowerCase())
  function handleRemoveFromScratchpad(item: ShapeDefinition): void {
    setScratchpadIds(removeScratchpadShape(item.id))
    useStore.getState().announce(`${item.label} removed from Scratchpad`)
  }
  if (documentFamily === 'class') {
    return (
      <div ref={paletteRef} className="component-palette" role="dialog" aria-modal="true" aria-label="Shape palette">
        <div className="component-palette__header"><span className="component-palette__title">Shapes</span><button className="component-palette__close" aria-label="Close palette" onClick={onClose}>✕</button></div>
        <section className="component-palette__section" aria-labelledby="shape-section-class"><h2 className="component-palette__category" id="shape-section-class">Class diagram</h2><div className="component-palette__grid">{CLASS_PALETTE_ITEMS.map(item => <button key={item.label} className="component-palette__item" aria-label={item.label} onClick={() => handleShapeClick(item)}><span className="component-palette__item-icon" aria-hidden="true">▦</span><span className="component-palette__item-label">{item.label}</span></button>)}</div></section>
      </div>
    )
  }

  const scratchpadItems = scratchpadIds.map(getShapeDefinition).filter((item): item is ShapeDefinition => item !== undefined).filter(matchesQuery)
  const generalItems = GENERAL_SHAPE_CATALOG.filter(matchesQuery)
  const advancedItems = ADVANCED_SHAPE_CATALOG.filter(matchesQuery)
  const hasMatches = scratchpadItems.length + generalItems.length + advancedItems.length > 0

  return (
    <div ref={paletteRef} className="component-palette" role="dialog" aria-modal="true" aria-label="Shape palette">
      <div className="component-palette__header"><span className="component-palette__title">Shapes</span><button className="component-palette__close" aria-label="Close palette" onClick={onClose}>✕</button></div>
      <input className="component-palette__search" type="text" placeholder="Search shapes…" value={query} onChange={event => setQuery(event.target.value)} aria-label="Search shapes" autoFocus />
      {hasMatches ? <>
        <ShapeSection title="Scratchpad" items={scratchpadItems} onSelect={handleShapeClick} onDragStart={handleDragStart} onRemove={handleRemoveFromScratchpad} />
        <ShapeSection title="General" items={generalItems} onSelect={handleShapeClick} onDragStart={handleDragStart} />
        <ShapeSection title="Advanced" items={advancedItems} onSelect={handleShapeClick} onDragStart={handleDragStart} />
      </> : <p className="component-palette__empty">No shapes match &ldquo;{query}&rdquo;</p>}
    </div>
  )
}
