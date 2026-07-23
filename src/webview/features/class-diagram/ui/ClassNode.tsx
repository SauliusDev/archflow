import React from 'react'
import type { ClassDefinition, ClassMember } from '@/features/class-diagram'
import '@/styles/components/class-diagram.css'

export interface ClassNodeDimensions { width: number; height: number }

const HEADER_HEIGHT = 52
const COMPARTMENT_HEADER_HEIGHT = 22
const MEMBER_HEIGHT = 22
const HORIZONTAL_PADDING = 28
const MIN_WIDTH = 180
const MAX_WIDTH = 420

function memberText(member: ClassMember): string {
  const marker = member.visibility === 'public' ? '+' : member.visibility === 'private' ? '-' : member.visibility === 'protected' ? '#' : member.visibility === 'package' ? '~' : ''
  const classifier = member.classifier === 'static' ? ' $' : member.classifier === 'abstract' ? ' *' : ''
  if (member.compartment === 'method') {
    const parameters = member.parameters?.join(', ') ?? ''
    return `${marker} ${member.name}(${parameters})${member.returnType ? `: ${member.returnType}` : ''}${classifier}`.trim()
  }
  return `${marker} ${member.name}${member.type ? `: ${member.type}` : ''}${classifier}`.trim()
}

export function classNodeDimensions(definition: ClassDefinition): ClassNodeDimensions {
  const members = [...definition.attributes, ...definition.methods].map(memberText)
  const title = `${definition.label}${definition.genericParameters.length ? `<${definition.genericParameters.join(', ')}>` : ''}`
  const widest = Math.max(title.length, definition.annotation?.length ?? 0, ...members.map(member => member.length), 0)
  return {
    width: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, widest * 8 + HORIZONTAL_PADDING)),
    height: HEADER_HEIGHT + COMPARTMENT_HEADER_HEIGHT * 2 + MEMBER_HEIGHT * members.length,
  }
}

function Compartment({ title, members }: { title: string; members: ClassMember[] }): React.JSX.Element {
  return (
    <section className="class-node__compartment" aria-label={`${title}`}>
      <span className="class-node__compartment-title">{title.split(' ').at(-1)}</span>
      {members.map(member => <div className="class-node__member" key={member.handle}>{memberText(member)}</div>)}
    </section>
  )
}

export function ClassNode({ definition, selected = false }: { definition: ClassDefinition; selected?: boolean }): React.JSX.Element {
  const dimensions = classNodeDimensions(definition)
  const title = `${definition.label}${definition.genericParameters.length ? `<${definition.genericParameters.join(', ')}>` : ''}`
  return (
    <article
      className={['class-diagram', 'class-node', selected ? 'class-node--selected' : ''].filter(Boolean).join(' ')}
      aria-label={`Class ${definition.label}`}
      data-class-id={definition.id}
      style={{ width: dimensions.width, minHeight: dimensions.height }}
    >
      <header className="class-node__header">
        {definition.annotation && <span className="class-node__annotation">«{definition.annotation}»</span>}
        <strong className="class-node__name">{title}</strong>
      </header>
      <Compartment title={`${definition.label} attributes`} members={definition.attributes} />
      <Compartment title={`${definition.label} methods`} members={definition.methods} />
    </article>
  )
}
