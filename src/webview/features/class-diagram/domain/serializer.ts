import type { ClassDefinition, ClassMember, ClassParseResult, ClassRelationship } from './types'

const visibility = { public: '+', private: '-', protected: '#', package: '~' } as const
const classifiers = { static: '$', abstract: '*' } as const

function memberOrdinal(member: ClassMember): number {
  return Number(member.handle.split(':').at(-1) ?? 0)
}

function serializeMember(member: ClassMember): string {
  const prefix = member.visibility ? visibility[member.visibility] : ''
  const suffix = member.classifier ? classifiers[member.classifier] : ''
  if (member.compartment === 'method') {
    const parameters = member.parameters?.join(', ') ?? ''
    return `${prefix}${member.type ? `${member.type} ` : ''}${member.name}(${parameters})${member.returnType ? ` ${member.returnType}` : ''}${suffix}`
  }
  return `${prefix}${member.type ? `${member.type} ` : ''}${member.name}${suffix}`
}

function serializeClass(definition: ClassDefinition, indent = ''): string[] {
  const generic = definition.genericParameters.length ? `~${definition.genericParameters.join(',')}~` : ''
  const annotation = definition.annotation ? ` <<${definition.annotation}>>` : ''
  const members = [...definition.attributes, ...definition.methods].sort((left, right) => memberOrdinal(left) - memberOrdinal(right))
  if (members.length === 0) return [`${indent}class ${definition.id}${generic}${annotation}`]
  return [
    `${indent}class ${definition.id}${generic}${annotation} {`,
    ...members.map(member => `${indent}  ${serializeMember(member)}`),
    `${indent}}`,
  ]
}

function relationshipSyntax(relationship: ClassRelationship): string {
  const arrows: Record<ClassRelationship['type'], string> = {
    inheritance: '--|>', composition: '*--', aggregation: 'o--', association: '-->', dependency: '..>', realization: '..|>', link: '--',
  }
  const sourceCardinality = relationship.sourceCardinality ? ` "${relationship.sourceCardinality}"` : ''
  const targetCardinality = relationship.targetCardinality ? ` "${relationship.targetCardinality}"` : ''
  return `${relationship.source}${sourceCardinality} ${arrows[relationship.type]}${targetCardinality} ${relationship.target}${relationship.label ? ` : ${relationship.label}` : ''}`
}

function namespaceLines(parsed: ClassParseResult, namespaceId: string, indent = ''): string[] {
  const namespace = parsed.namespaces.find(item => item.id === namespaceId)
  if (!namespace) return []
  const children = parsed.classes.filter(item => item.parentId === namespaceId)
  const nested = parsed.namespaces.filter(item => item.parentId === namespaceId)
  return [
    `${indent}namespace ${namespace.id} {`,
    ...children.flatMap(item => serializeClass(item, `${indent}  `)),
    ...nested.flatMap(item => namespaceLines(parsed, item.id, `${indent}  `)),
    `${indent}}`,
  ]
}

function preserveConstruct(text: string, activeClassIds: ReadonlySet<string>): boolean {
  const line = text.trim()
  const target = /^(?:note\s+for|click|callback|link|style)\s+([A-Za-z_][A-Za-z0-9_-]*)\b/.exec(line)?.[1]
  if (target) return activeClassIds.has(target)
  const cssClass = /^cssClass\s+"([^"]+)"\b/.exec(line)?.[1]
  if (cssClass) return cssClass.split(',').some(id => activeClassIds.has(id.trim()))
  return true
}

export function serializeClassDiagram(parsed: ClassParseResult): string {
  const topLevelClasses = parsed.classes.filter(item => !item.parentId)
  const topLevelNamespaces = parsed.namespaces.filter(item => !item.parentId)
  const activeClassIds = new Set(parsed.classes.map(item => item.id))
  const frontmatter = parsed.sourceMap.constructs
    .filter(item => item.kind === 'frontmatter')
    .map(item => item.text)
  const preserved = parsed.sourceMap.constructs
    .filter(item => item.kind === 'comment' || item.kind === 'directive')
    .filter(item => preserveConstruct(item.text, activeClassIds))
    .map(item => item.text)
  return [
    ...frontmatter,
    'classDiagram',
    ...topLevelClasses.flatMap(item => serializeClass(item)),
    ...topLevelNamespaces.flatMap(item => namespaceLines(parsed, item.id)),
    ...parsed.relationships.map(relationshipSyntax),
    ...preserved,
    '',
  ].join('\n')
}
