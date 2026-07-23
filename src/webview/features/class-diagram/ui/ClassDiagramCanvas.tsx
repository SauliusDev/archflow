import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '@/state/createStore'
import type { ClassMember, ClassRelationship, ClassRelationshipType } from '@/features/class-diagram'
import { ClassNode, classNodeDimensions } from './ClassNode'
import { ClassRelationshipEdge } from './ClassRelationshipEdge'
import { NamespaceNode } from './NamespaceNode'
import type { LayoutStateV2 } from '../../../../shared/diagram-contracts'
import '@/styles/components/class-diagram.css'

type ClassAnnotation = 'interface' | 'abstract' | 'enumeration' | 'service'

const relationshipTypes: ClassRelationshipType[] = [
  'inheritance', 'composition', 'aggregation', 'association', 'dependency', 'realization', 'link',
]

function nextClassId(ids: Set<string>): string {
  if (!ids.has('Class')) return 'Class'
  let ordinal = 2
  while (ids.has(`Class${ordinal}`)) ordinal += 1
  return `Class${ordinal}`
}

function nextNamespaceId(ids: Set<string>): string {
  if (!ids.has('Namespace')) return 'Namespace'
  let ordinal = 2
  while (ids.has(`Namespace${ordinal}`)) ordinal += 1
  return `Namespace${ordinal}`
}

function memberSignature(member: ClassMember): string {
  const visibility = member.visibility === 'public' ? '+' : member.visibility === 'private' ? '-' : member.visibility === 'protected' ? '#' : member.visibility === 'package' ? '~' : ''
  const classifier = member.classifier === 'static' ? '$' : member.classifier === 'abstract' ? '*' : ''
  if (member.compartment === 'method') {
    return `${visibility}${member.type ? `${member.type} ` : ''}${member.name}(${member.parameters?.join(', ') ?? ''})${member.returnType ? ` ${member.returnType}` : ''}${classifier}`
  }
  return `${visibility}${member.type ? `${member.type} ` : ''}${member.name}${classifier}`
}

function edgeEndpoint(source: { x: number; y: number; width: number; height: number }, target: { x: number; y: number; width: number; height: number }): { x: number; y: number } {
  const sx = source.x + source.width / 2
  const sy = source.y + source.height / 2
  const tx = target.x + target.width / 2
  const ty = target.y + target.height / 2
  if (Math.abs(tx - sx) >= Math.abs(ty - sy)) return { x: sx + (tx >= sx ? source.width / 2 : -source.width / 2), y: sy }
  return { x: sx, y: sy + (ty >= sy ? source.height / 2 : -source.height / 2) }
}

function renderedClassGeometry(
  definition: { id: string; parentId?: string },
  index: number,
  layout: LayoutStateV2 | undefined,
  measured: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const saved = layout?.elements[`class:${definition.id}`]
  const parent = definition.parentId ? layout?.elements[`namespace:${definition.parentId}`] : undefined
  return {
    x: (saved?.x ?? 48 + index * 216) + (parent?.x ?? 0),
    y: (saved?.y ?? 48) + (parent?.y ?? 0),
    width: saved?.width ?? measured.width,
    height: saved?.height ?? measured.height,
  }
}

function MemberRow({ member }: { member: ClassMember }): React.JSX.Element {
  const apply = useStore(s => s.applyClassOperation)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(memberSignature(member))

  useEffect(() => setDraft(memberSignature(member)), [member])

  const commit = (): void => {
    const text = draft.trim()
    if (text && text !== memberSignature(member)) apply({ kind: 'edit-member', handle: member.handle, memberText: text })
    setEditing(false)
  }
  const move = (direction: 'up' | 'down'): void => {
    const definition = useStore.getState().classDiagram?.classes.find(item =>
      [...item.attributes, ...item.methods].some(candidate => candidate.handle === member.handle),
    )
    const siblings = member.compartment === 'attribute' ? definition?.attributes ?? [] : definition?.methods ?? []
    const index = siblings.findIndex(candidate => candidate.handle === member.handle)
    if (index < 0) return
    const beforeHandle = direction === 'up'
      ? siblings[index - 1]?.handle
      : siblings[index + 2]?.handle
    apply({ kind: 'reorder-member', handle: member.handle, ...(beforeHandle ? { beforeHandle } : {}) })
  }

  return (
    <li className="class-canvas__member-row">
      {editing ? (
        <input
          aria-label={`Member ${member.handle}`}
          autoFocus
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === 'Enter') { event.preventDefault(); commit() }
            if (event.key === 'Escape') { event.preventDefault(); setDraft(memberSignature(member)); setEditing(false) }
          }}
        />
      ) : <span>{memberSignature(member)}</span>}
      <div className="class-canvas__member-actions">
        <button type="button" aria-label={`Edit ${member.name}`} onClick={() => setEditing(true)}>Edit</button>
        <button type="button" aria-label={`Move ${member.name} up`} onClick={() => move('up')}>↑</button>
        <button type="button" aria-label={`Move ${member.name} down`} onClick={() => move('down')}>↓</button>
        {member.visibility !== 'public' && <button type="button" aria-label={`Make ${member.name} public`} onClick={() => apply({ kind: 'set-visibility', handle: member.handle, visibility: 'public' })}>+</button>}
        {member.visibility !== 'private' && <button type="button" aria-label={`Make ${member.name} private`} onClick={() => apply({ kind: 'set-visibility', handle: member.handle, visibility: 'private' })}>−</button>}
        {member.classifier !== 'static' && <button type="button" aria-label={`Make ${member.name} static`} onClick={() => apply({ kind: 'set-classifier', handle: member.handle, classifier: 'static' })}>$</button>}
        {member.classifier !== 'abstract' && <button type="button" aria-label={`Make ${member.name} abstract`} onClick={() => apply({ kind: 'set-classifier', handle: member.handle, classifier: 'abstract' })}>*</button>}
        <button type="button" aria-label={`Delete ${member.name}`} onClick={() => apply({ kind: 'delete-member', handle: member.handle })}>Delete</button>
      </div>
    </li>
  )
}

export default function ClassDiagramCanvas(): React.JSX.Element {
  const diagram = useStore(s => s.classDiagram)
  const apply = useStore(s => s.applyClassOperation)
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null)
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [nameDraft, setNameDraft] = useState('')
  const [attributeDraft, setAttributeDraft] = useState('')
  const [methodDraft, setMethodDraft] = useState('')
  const [relationshipSource, setRelationshipSource] = useState('')
  const [relationshipTarget, setRelationshipTarget] = useState('')
  const [relationshipType, setRelationshipType] = useState<ClassRelationshipType>('association')

  const classes = diagram?.classes ?? []
  const relationships = diagram?.relationships ?? []
  const selectedClass = classes.find(item => item.id === selectedClassId) ?? null
  const selectedRelationship = relationships.find(item => item.id === selectedRelationshipId) ?? null
  const classIds = useMemo(() => new Set(classes.map(item => item.id)), [classes])
  const namespaceIds = useMemo(() => new Set((diagram?.namespaces ?? []).map(item => item.id)), [diagram?.namespaces])
  const layout = useStore(s => s.documentSession?.layout)
  const updateGeometry = useStore(s => s.updateClassGeometry)
  const gesture = useRef<{ id: string; kind: 'move' | 'resize'; startX: number; startY: number; geometry: { x: number; y: number; width: number; height: number } } | null>(null)

  useEffect(() => {
    if (selectedClassId && !classes.some(item => item.id === selectedClassId)) setSelectedClassId(null)
    if (selectedRelationshipId && !relationships.some(item => item.id === selectedRelationshipId)) setSelectedRelationshipId(null)
  }, [classes, relationships, selectedClassId, selectedRelationshipId])

  useEffect(() => {
    const finishGesture = (event: PointerEvent): void => {
      const active = gesture.current
      if (!active) return
      gesture.current = null
      const dx = event.clientX - active.startX
      const dy = event.clientY - active.startY
      updateGeometry(active.id, active.kind === 'move'
        ? { ...active.geometry, x: active.geometry.x + dx, y: active.geometry.y + dy }
        : { ...active.geometry, width: Math.max(180, active.geometry.width + dx), height: Math.max(96, active.geometry.height + dy) })
    }
    window.addEventListener('pointerup', finishGesture)
    return () => window.removeEventListener('pointerup', finishGesture)
  }, [updateGeometry])

  const startRename = (id: string, label: string): void => { setSelectedClassId(id); setRenaming(id); setNameDraft(label) }
  const commitRename = (): void => {
    if (!renaming) return
    const label = nameDraft.trim()
    if (label && label !== renaming) apply({ kind: 'rename-class', id: renaming, label })
    setRenaming(null)
  }
  const createClass = (): void => {
    const id = nextClassId(classIds)
    apply({ kind: 'add-class', id })
    updateGeometry(id, { x: 48 + classes.length * 216, y: 48, width: 180, height: 96 })
    startRename(id, id)
  }
  const createNamespace = (): void => apply({ kind: 'add-namespace', id: nextNamespaceId(namespaceIds) })
  const addMember = (compartment: 'attribute' | 'method'): void => {
    if (!selectedClass) return
    const text = (compartment === 'attribute' ? attributeDraft : methodDraft).trim()
    if (!text) return
    apply({ kind: 'add-member', classId: selectedClass.id, memberText: text })
    if (compartment === 'attribute') setAttributeDraft('')
    else setMethodDraft('')
  }
  const createRelationship = (): void => {
    if (!relationshipSource || !relationshipTarget) return
    apply({ kind: 'add-relationship', source: relationshipSource, target: relationshipTarget, type: relationshipType })
  }
  const updateRelationship = (patch: Partial<Pick<ClassRelationship, 'type' | 'sourceCardinality' | 'targetCardinality' | 'label'>>): void => {
    if (!selectedRelationship) return
    apply({ kind: 'update-relationship', id: selectedRelationship.id, ...patch })
  }

  return (
    <section className="class-canvas" aria-label="Class diagram canvas">
      <header className="class-canvas__toolbar">
        <button type="button" aria-label="Add class" onClick={createClass}>Add class</button>
        <button type="button" aria-label="Add namespace" onClick={createNamespace}>Add namespace</button>
        <label>Source<select aria-label="Relationship source" value={relationshipSource} onChange={event => setRelationshipSource(event.target.value)}><option value="">Choose</option>{classes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Target<select aria-label="Relationship target" value={relationshipTarget} onChange={event => setRelationshipTarget(event.target.value)}><option value="">Choose</option>{classes.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Type<select aria-label="Relationship type" value={relationshipType} onChange={event => setRelationshipType(event.target.value as ClassRelationshipType)}>{relationshipTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
        <button type="button" aria-label="Create relationship" disabled={!relationshipSource || !relationshipTarget || relationshipSource === relationshipTarget} onClick={createRelationship}>Connect</button>
      </header>

      <div className="class-canvas__surface">
        {diagram?.namespaces.map(namespace => {
          const geometry = layout?.elements[`namespace:${namespace.id}`] ?? { x: 48, y: 48, width: 320, height: 240 }
          return <div className="class-canvas__namespace" key={namespace.id} style={{ left: geometry.x, top: geometry.y, width: geometry.width, height: geometry.height }}><NamespaceNode namespace={namespace} /><button type="button" aria-label={`Delete namespace ${namespace.label}`} onClick={() => apply({ kind: 'delete-namespace', id: namespace.id })}>Delete namespace</button></div>
        })}
        <div className="class-canvas__classes">
          {classes.map((definition, index) => {
            const measured = classNodeDimensions(definition)
            const parent = definition.parentId ? layout?.elements[`namespace:${definition.parentId}`] : undefined
            const geometry = renderedClassGeometry(definition, index, layout, measured)
            const startGesture = (kind: 'move' | 'resize', event: React.PointerEvent): void => {
              event.preventDefault()
              gesture.current = { id: definition.id, kind, startX: event.clientX, startY: event.clientY, geometry: { ...geometry, x: geometry.x - (parent?.x ?? 0), y: geometry.y - (parent?.y ?? 0) } }
            }
            return <div className="class-canvas__class" key={definition.id} style={{ left: geometry.x, top: geometry.y, width: geometry.width, minHeight: geometry.height }}>
              <button type="button" className="class-canvas__select" aria-label={`Select class ${definition.label}`} onClick={() => setSelectedClassId(definition.id)} />
              <button type="button" className="class-canvas__move" aria-label={`Move class ${definition.label}`} onPointerDown={event => startGesture('move', event)}>Move</button>
              {renaming === definition.id ? (
                <input aria-label="Class name" autoFocus value={nameDraft} onChange={event => setNameDraft(event.target.value)} onBlur={commitRename} onKeyDown={event => {
                  if (event.key === 'Enter') { event.preventDefault(); commitRename() }
                  if (event.key === 'Escape') { event.preventDefault(); setRenaming(null) }
                }} />
              ) : <button type="button" className="class-canvas__name" onDoubleClick={() => startRename(definition.id, definition.label)} onClick={() => setSelectedClassId(definition.id)}>{definition.label}</button>}
              <ClassNode definition={definition} selected={selectedClassId === definition.id} />
              <div className="class-canvas__resize" role="separator" aria-label={`Resize class ${definition.label}`} tabIndex={0} onPointerDown={event => startGesture('resize', event)} />
            </div>
          })}
        </div>
        <svg className="class-canvas__relationships" aria-label="Relationships">{relationships.map(relationship => {
          const source = classes.find(item => item.id === relationship.source)
          const target = classes.find(item => item.id === relationship.target)
          if (!source || !target) return null
          const sourceBox = renderedClassGeometry(source, classes.indexOf(source), layout, classNodeDimensions(source))
          const targetBox = renderedClassGeometry(target, classes.indexOf(target), layout, classNodeDimensions(target))
          return <g key={relationship.id} onClick={() => setSelectedRelationshipId(relationship.id)}><title>{relationship.type}</title><ClassRelationshipEdge relationship={relationship} source={edgeEndpoint(sourceBox, targetBox)} target={edgeEndpoint(targetBox, sourceBox)} /></g>
        })}</svg>
        <ul className="class-canvas__relationship-list">{relationships.map(relationship => <li key={relationship.id}><button type="button" aria-label={`Select relationship ${relationship.id}`} onClick={() => setSelectedRelationshipId(relationship.id)}>{relationship.source} {relationship.type} {relationship.target}</button></li>)}</ul>
      </div>

      {selectedClass && <aside className="class-canvas__editor" aria-label={`Edit class ${selectedClass.label}`}>
        <h2>{selectedClass.label}</h2>
        <button type="button" aria-label={`Delete class ${selectedClass.label}`} onClick={() => apply({ kind: 'delete-class', id: selectedClass.id })}>Delete class</button>
        <label>Namespace<select aria-label="Class namespace" value={selectedClass.parentId ?? ''} onChange={event => apply({ kind: 'move-class-to-namespace', id: selectedClass.id, namespaceId: event.target.value || null })}><option value="">Top level</option>{diagram?.namespaces.map(namespace => <option key={namespace.id} value={namespace.id}>{namespace.label}</option>)}</select></label>
        <label>Annotation<select value={selectedClass.annotation ?? ''} onChange={event => apply({ kind: 'set-annotation', id: selectedClass.id, annotation: (event.target.value || undefined) as ClassAnnotation | undefined })}><option value="">None</option>{(['interface', 'abstract', 'enumeration', 'service'] as ClassAnnotation[]).map(annotation => <option key={annotation} value={annotation}>{annotation}</option>)}</select></label>
        <label>Attribute<input aria-label="New attribute" value={attributeDraft} onChange={event => setAttributeDraft(event.target.value)} onKeyDown={event => event.key === 'Enter' && addMember('attribute')} /></label><button type="button" aria-label="Add attribute" onClick={() => addMember('attribute')}>Add attribute</button>
        <label>Method<input aria-label="New method" value={methodDraft} onChange={event => setMethodDraft(event.target.value)} onKeyDown={event => event.key === 'Enter' && addMember('method')} /></label><button type="button" aria-label="Add method" onClick={() => addMember('method')}>Add method</button>
        <h3>Attributes</h3><ul>{selectedClass.attributes.map(member => <MemberRow key={member.handle} member={member} />)}</ul>
        <h3>Methods</h3><ul>{selectedClass.methods.map(member => <MemberRow key={member.handle} member={member} />)}</ul>
      </aside>}

      {selectedRelationship && <aside className="class-canvas__editor" aria-label={`Edit relationship ${selectedRelationship.id}`}>
        <h2>{selectedRelationship.source} → {selectedRelationship.target}</h2>
        <label>Type<select aria-label="Selected relationship type" value={selectedRelationship.type} onChange={event => updateRelationship({ type: event.target.value as ClassRelationshipType })}>{relationshipTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
        <label>Source cardinality<input aria-label="Source cardinality" value={selectedRelationship.sourceCardinality ?? ''} onChange={event => updateRelationship({ sourceCardinality: event.target.value || undefined })} /></label>
        <label>Target cardinality<input aria-label="Target cardinality" value={selectedRelationship.targetCardinality ?? ''} onChange={event => updateRelationship({ targetCardinality: event.target.value || undefined })} /></label>
        <label>Label<input aria-label="Relationship label" value={selectedRelationship.label ?? ''} onChange={event => updateRelationship({ label: event.target.value || undefined })} /></label>
        <button type="button" aria-label="Reverse relationship" onClick={() => apply({ kind: 'reverse-relationship', id: selectedRelationship.id })}>Reverse</button>
        <button type="button" aria-label="Delete relationship" onClick={() => apply({ kind: 'delete-relationship', id: selectedRelationship.id })}>Delete relationship</button>
      </aside>}
    </section>
  )
}
