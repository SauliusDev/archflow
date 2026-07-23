import type { SourceOperation, SourceRange } from '../../../../shared/diagram-contracts'
import { SemanticValidationError } from '../../../../shared/diagram-contracts'
import type {
  ClassClassifier,
  ClassMember,
  ClassParseResult,
  ClassRelationship,
  ClassRelationshipType,
  ClassVisibility,
} from './types'

export type ClassSemanticOperation =
  | { kind: 'add-class'; id: string; annotation?: 'interface' | 'abstract' | 'enumeration' | 'service'; namespaceId?: string | null }
  | { kind: 'add-namespace'; id: string }
  | { kind: 'rename-class'; id: string; label: string }
  | { kind: 'delete-class'; id: string }
  | { kind: 'add-member'; classId: string; memberText: string }
  | { kind: 'edit-member'; handle: string; memberText: string }
  | { kind: 'reorder-member'; handle: string; beforeHandle?: string }
  | { kind: 'delete-member'; handle: string }
  | { kind: 'set-visibility'; handle: string; visibility?: ClassVisibility }
  | { kind: 'set-classifier'; handle: string; classifier?: ClassClassifier }
  | { kind: 'set-annotation'; id: string; annotation?: 'interface' | 'abstract' | 'enumeration' | 'service' }
  | { kind: 'add-relationship'; source: string; target: string; type: ClassRelationshipType; sourceCardinality?: string; targetCardinality?: string; label?: string }
  | { kind: 'update-relationship'; id: string; type?: ClassRelationshipType; sourceCardinality?: string; targetCardinality?: string; label?: string }
  | { kind: 'reverse-relationship'; id: string }
  | { kind: 'delete-relationship'; id: string }
  | { kind: 'set-cardinality'; id: string; end: 'source' | 'target'; value?: string }
  | { kind: 'move-class-to-namespace'; id: string; namespaceId: string | null }
  | { kind: 'delete-namespace'; id: string }

interface LineSpan {
  text: string
  start: number
  end: number
  fullEnd: number
}

interface Block {
  id: string
  kind: 'class' | 'namespace'
  opening: LineSpan
  closing: LineSpan
  parentNamespaceId?: string
}

const identifier = /^[A-Za-z_][A-Za-z0-9_-]*$/
const relationshipTokens: Record<ClassRelationshipType, string> = {
  inheritance: '--|>', composition: '*--', aggregation: 'o--', association: '-->',
  dependency: '..>', realization: '..|>', link: '--',
}
const visibilityMarkers: Record<Exclude<ClassVisibility, undefined>, string> = {
  public: '+', private: '-', protected: '#', package: '~',
}

function lines(source: string): LineSpan[] {
  const result: LineSpan[] = []
  const matcher = /.*(?:\r\n|\n|\r|$)/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(source)) !== null) {
    if (!match[0]) break
    const newlineLength = match[0].endsWith('\r\n') ? 2 : /[\r\n]$/.test(match[0]) ? 1 : 0
    result.push({
      text: match[0].slice(0, match[0].length - newlineLength), start: match.index,
      end: match.index + match[0].length - newlineLength, fullEnd: match.index + match[0].length,
    })
  }
  return result
}

function blocks(source: string): Block[] {
  const stack: Array<Omit<Block, 'closing'>> = []
  const result: Block[] = []
  for (const span of lines(source)) {
    const trimmed = span.text.trim()
    const namespace = /^namespace\s+([A-Za-z_][A-Za-z0-9_-]*)\s*\{$/.exec(trimmed)
    const classDefinition = /^class\s+([A-Za-z_][A-Za-z0-9_-]*)(?:~[^~]+~)?(?:\s+<<[A-Za-z]+>>)?\s*\{$/.exec(trimmed)
    if (namespace || classDefinition) {
      stack.push({
        id: (namespace ?? classDefinition)![1], kind: namespace ? 'namespace' : 'class', opening: span,
        ...(namespace && stack.at(-1)?.kind === 'namespace' ? { parentNamespaceId: stack.at(-1)!.id } : {}),
      })
      continue
    }
    if (trimmed === '}') {
      const opening = stack.pop()
      if (opening) result.push({ ...opening, closing: span })
    }
  }
  return result
}

function assertIdentifier(value: string, label: string): void {
  if (!identifier.test(value)) throw new SemanticValidationError(`${label} is not valid classDiagram syntax`)
}

function assertSingleLine(value: string, label: string): void {
  if (!value.trim() || /[\r\n]/.test(value)) throw new SemanticValidationError(`${label} must be one non-empty line`)
}

function fullLineOperation(kind: 'delete' | 'replace', span: LineSpan, source: string, revision: number, text?: string): SourceOperation {
  const range: SourceRange = kind === 'delete' ? { start: span.start, end: span.fullEnd } : { start: span.start, end: span.end }
  const expectedText = source.slice(range.start, range.end)
  if (kind === 'delete') return { kind, range, expectedText, expectedRevision: revision }
  return { kind, range, text: text!, expectedText, expectedRevision: revision }
}

function memberFor(parsed: ClassParseResult, handle: string): ClassMember {
  const member = parsed.classes.flatMap(definition => [...definition.attributes, ...definition.methods])
    .find(candidate => candidate.handle === handle)
  if (!member?.range) throw new SemanticValidationError(`Member ${handle} has no stable source range`)
  return member
}

function memberText(member: ClassMember, visibility = member.visibility, classifier = member.classifier): string {
  const prefix = visibility ? visibilityMarkers[visibility] : ''
  const suffix = classifier === 'static' ? '$' : classifier === 'abstract' ? '*' : ''
  if (member.compartment === 'method') {
    const type = member.type ? `${member.type} ` : ''
    const parameters = (member.parameters ?? []).join(', ')
    const returnType = member.returnType ? ` ${member.returnType}` : ''
    return `${prefix}${type}${member.name}(${parameters})${returnType}${suffix}`
  }
  return `${prefix}${member.type ? `${member.type} ` : ''}${member.name}${suffix}`
}

function statementPrefix(source: string, range: SourceRange): string {
  const line = source.slice(range.start, range.end)
  return /^(\s*[A-Za-z_][A-Za-z0-9_-]*\s*:\s*)/.exec(line)?.[1] ?? line.match(/^\s*/)?.[0] ?? ''
}

function memberReplacement(parsed: ClassParseResult, member: ClassMember, text: string): SourceOperation {
  assertSingleLine(text, 'Member replacement')
  const expectedText = parsed.concrete.source.slice(member.range!.start, member.range!.end)
  return {
    kind: 'replace', range: member.range!, text: `${statementPrefix(parsed.concrete.source, member.range!)}${text.trim()}`,
    expectedText, expectedRevision: parsed.concrete.revision,
  }
}

function relationshipFor(parsed: ClassParseResult, id: string): { relationship: ClassRelationship; span: LineSpan } {
  const relationship = parsed.relationships.find(candidate => candidate.id === id)
  if (!relationship) throw new SemanticValidationError(`Relationship ${id} has no stable source handle`)
  const span = lines(parsed.concrete.source)[Number(id.slice('relationship:'.length))]
  if (!span) throw new SemanticValidationError(`Relationship ${id} has no stable source range`)
  return { relationship, span }
}

function renderRelationship(relationship: Omit<ClassRelationship, 'id'>): string {
  const sourceCardinality = relationship.sourceCardinality ? ` "${relationship.sourceCardinality}"` : ''
  const targetCardinality = relationship.targetCardinality ? ` "${relationship.targetCardinality}"` : ''
  const label = relationship.label ? ` : ${relationship.label}` : ''
  return `${relationship.source}${sourceCardinality} ${relationshipTokens[relationship.type]}${targetCardinality} ${relationship.target}${label}`
}

function insertionPoint(parsed: ClassParseResult): number {
  // The source-map range for a final relationship ends before its newline.  An
  // insertion there would concatenate the new declaration onto that line.
  // Appending at EOF preserves every prior line and supplies a stable boundary.
  return parsed.concrete.source.length
}

function insertionPrefix(source: string, indent = ''): string {
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  return source.endsWith('\n') || source.endsWith('\r') ? indent : `${newline}${indent}`
}

function classBlock(parsed: ClassParseResult, id: string): Block | undefined {
  return blocks(parsed.concrete.source).find(block => block.kind === 'class' && block.id === id)
}

function namespaceBlock(parsed: ClassParseResult, id: string): Block | undefined {
  return blocks(parsed.concrete.source).find(block => block.kind === 'namespace' && block.id === id)
}

function classStatementSpans(parsed: ClassParseResult, id: string): LineSpan[] {
  return lines(parsed.concrete.source).filter(span => new RegExp(`^\\s*${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:`).test(span.text))
}

function classDeclarationSpan(parsed: ClassParseResult, id: string): LineSpan | undefined {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return lines(parsed.concrete.source).find(span => new RegExp(`^\\s*class\\s+${escaped}(?:\\s|$)`).test(span.text))
}

function classOwnedSpans(parsed: ClassParseResult, id: string): LineSpan[] {
  const block = classBlock(parsed, id)
  if (block) return lines(parsed.concrete.source).filter(span => span.start >= block.opening.start && span.fullEnd <= block.closing.fullEnd)
  return [classDeclarationSpan(parsed, id), ...classStatementSpans(parsed, id)].filter((span): span is LineSpan => Boolean(span))
}

export function issueClassMemberReplacement(parsed: ClassParseResult, handle: string, text: string): SourceOperation {
  return memberReplacement(parsed, memberFor(parsed, handle), text)
}

export function issueClassOperation(parsed: ClassParseResult, operation: ClassSemanticOperation): SourceOperation[] {
  const { source, revision } = parsed.concrete
  const newline = source.includes('\r\n') ? '\r\n' : '\n'

  if (operation.kind === 'add-class') {
    assertIdentifier(operation.id, 'Class id')
    if (parsed.classes.some(definition => definition.id === operation.id)) throw new SemanticValidationError(`Class ${operation.id} already exists`)
    const annotation = operation.annotation ? ` <<${operation.annotation}>>` : ''
    const text = `class ${operation.id}${annotation} {${newline}}`
    if (operation.namespaceId) {
      const namespace = namespaceBlock(parsed, operation.namespaceId)
      if (!namespace) throw new SemanticValidationError(`Namespace ${operation.namespaceId} has no stable source boundary`)
      const indent = `${namespace.opening.text.match(/^\s*/)?.[0] ?? ''}  `
      return [{ kind: 'insert', at: namespace.closing.start, text: `${indent}${text}${newline}`, expectedRevision: revision }]
    }
    return [{ kind: 'insert', at: insertionPoint(parsed), text: `${insertionPrefix(source)}${text}`, expectedRevision: revision }]
  }

  if (operation.kind === 'add-namespace') {
    assertIdentifier(operation.id, 'Namespace id')
    if (parsed.namespaces.some(namespace => namespace.id === operation.id)) throw new SemanticValidationError(`Namespace ${operation.id} already exists`)
    const text = `namespace ${operation.id} {${newline}}`
    return [{ kind: 'insert', at: insertionPoint(parsed), text: `${insertionPrefix(source)}${text}`, expectedRevision: revision }]
  }

  if (operation.kind === 'rename-class') {
    assertIdentifier(operation.label, 'Class name')
    if (!parsed.classes.some(definition => definition.id === operation.id)) throw new SemanticValidationError(`Class ${operation.id} does not exist`)
    const escaped = operation.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const ranges = parsed.sourceMap.constructs.filter(construct => ['class', 'member', 'relationship'].includes(construct.kind))
      .flatMap(construct => {
        const matches = [...construct.text.matchAll(new RegExp(`\\b${escaped}\\b`, 'g'))]
        return matches.map(match => ({ start: construct.range.start + match.index!, end: construct.range.start + match.index! + operation.id.length }))
      })
    if (!ranges.length) throw new SemanticValidationError(`Class ${operation.id} has no stable source handle`)
    return ranges.map(range => ({ kind: 'replace', range, text: operation.label, expectedText: operation.id, expectedRevision: revision }))
  }

  if (operation.kind === 'delete-class') {
    const spans = classOwnedSpans(parsed, operation.id)
    if (!spans.length) throw new SemanticValidationError(`Class ${operation.id} has no stable source boundary`)
    const relationships = parsed.relationships.filter(edge => edge.source === operation.id || edge.target === operation.id)
      .map(edge => relationshipFor(parsed, edge.id).span)
    return [...spans, ...relationships].map(span => fullLineOperation('delete', span, source, revision))
  }

  if (operation.kind === 'add-member') {
    assertSingleLine(operation.memberText, 'Member')
    const block = classBlock(parsed, operation.classId)
    if (!block) throw new SemanticValidationError(`Class ${operation.classId} has no stable member insertion boundary`)
    const indent = `${block.opening.text.match(/^\s*/)?.[0] ?? ''}  `
    return [{ kind: 'insert', at: block.closing.start, text: `${indent}${operation.memberText.trim()}${newline}`, expectedRevision: revision }]
  }

  if (operation.kind === 'edit-member') return [memberReplacement(parsed, memberFor(parsed, operation.handle), operation.memberText)]

  if (operation.kind === 'delete-member') {
    const member = memberFor(parsed, operation.handle)
    const span = lines(source).find(candidate => candidate.start === member.range!.start)
    if (!span) throw new SemanticValidationError(`Member ${operation.handle} has no stable source range`)
    return [fullLineOperation('delete', span, source, revision)]
  }

  if (operation.kind === 'reorder-member') {
    const member = memberFor(parsed, operation.handle)
    const owner = parsed.classes.find(definition => [...definition.attributes, ...definition.methods].some(candidate => candidate.handle === member.handle))!
    const siblings = member.compartment === 'attribute' ? owner.attributes : owner.methods
    const before = operation.beforeHandle ? siblings.find(candidate => candidate.handle === operation.beforeHandle) : undefined
    if (operation.beforeHandle && (!before || before.compartment !== member.compartment)) throw new SemanticValidationError('Members can only be reordered within their compartment')
    if (before?.handle === member.handle) return []
    const span = lines(source).find(candidate => candidate.start === member.range!.start)
    if (!span) throw new SemanticValidationError(`Member ${operation.handle} has no stable source range`)
    const at = before?.range?.start ?? classBlock(parsed, owner.id)?.closing.start
    if (at === undefined) throw new SemanticValidationError(`Class ${owner.id} has no stable member insertion boundary`)
    return [
      fullLineOperation('delete', span, source, revision),
      { kind: 'insert', at, text: `${span.text}${newline}`, expectedRevision: revision },
    ]
  }

  if (operation.kind === 'set-visibility' || operation.kind === 'set-classifier') {
    const member = memberFor(parsed, operation.handle)
    const text = operation.kind === 'set-visibility'
      ? memberText(member, operation.visibility, member.classifier)
      : memberText(member, member.visibility, operation.classifier)
    return [memberReplacement(parsed, member, text)]
  }

  if (operation.kind === 'set-annotation') {
    const block = classBlock(parsed, operation.id)
    if (!block) throw new SemanticValidationError(`Class ${operation.id} has no stable annotation handle`)
    const body = lines(source).filter(span => span.start > block.opening.end && span.end < block.closing.start)
    const separate = body.find(span => /^\s*<<[A-Za-z]+>>\s*$/.test(span.text))
    if (separate) {
      if (!operation.annotation) return [fullLineOperation('delete', separate, source, revision)]
      const indent = separate.text.match(/^\s*/)?.[0] ?? ''
      return [fullLineOperation('replace', separate, source, revision, `${indent}<<${operation.annotation}>>`)]
    }
    const replacement = block.opening.text.replace(/\s*<<[A-Za-z]+>>(?=\s*\{\s*$)/, '')
      .replace(/\s*\{\s*$/, `${operation.annotation ? ` <<${operation.annotation}>>` : ''} {`)
    return [fullLineOperation('replace', block.opening, source, revision, replacement)]
  }

  if (operation.kind === 'add-relationship') {
    assertIdentifier(operation.source, 'Relationship source')
    assertIdentifier(operation.target, 'Relationship target')
    if (operation.source === operation.target) throw new SemanticValidationError('A relationship requires two distinct classes')
    if (!parsed.classes.some(definition => definition.id === operation.source) || !parsed.classes.some(definition => definition.id === operation.target)) {
      throw new SemanticValidationError('Relationship endpoints must exist')
    }
    if (parsed.relationships.some(edge => edge.source === operation.source && edge.target === operation.target && edge.type === operation.type)) {
      throw new SemanticValidationError('A matching relationship already exists')
    }
    return [{
      kind: 'insert', at: insertionPoint(parsed), text: `${insertionPrefix(source)}${renderRelationship(operation)}`,
      expectedRevision: revision,
    }]
  }

  if (operation.kind === 'update-relationship' || operation.kind === 'set-cardinality' || operation.kind === 'reverse-relationship') {
    const { relationship, span } = relationshipFor(parsed, operation.id)
    const next: ClassRelationship = { ...relationship }
    if (operation.kind === 'update-relationship') {
      if (operation.type) next.type = operation.type
      if ('label' in operation) {
        if (operation.label) next.label = operation.label
        else delete next.label
      }
      if ('sourceCardinality' in operation) {
        if (operation.sourceCardinality) next.sourceCardinality = operation.sourceCardinality
        else delete next.sourceCardinality
      }
      if ('targetCardinality' in operation) {
        if (operation.targetCardinality) next.targetCardinality = operation.targetCardinality
        else delete next.targetCardinality
      }
    } else if (operation.kind === 'set-cardinality') {
      const cardinalityKey = operation.end === 'source' ? 'sourceCardinality' : 'targetCardinality'
      if (operation.value) next[cardinalityKey] = operation.value
      else delete next[cardinalityKey]
    } else {
      const sourceId = next.source
      next.source = next.target
      next.target = sourceId
      const sourceCardinality = next.sourceCardinality
      if (next.targetCardinality) next.sourceCardinality = next.targetCardinality
      else delete next.sourceCardinality
      if (sourceCardinality) next.targetCardinality = sourceCardinality
      else delete next.targetCardinality
    }
    const indent = span.text.match(/^\s*/)?.[0] ?? ''
    return [fullLineOperation('replace', span, source, revision, `${indent}${renderRelationship(next)}`)]
  }

  if (operation.kind === 'delete-relationship') {
    const { span } = relationshipFor(parsed, operation.id)
    return [fullLineOperation('delete', span, source, revision)]
  }

  if (operation.kind === 'move-class-to-namespace') {
    const classBlockToMove = classBlock(parsed, operation.id)
    const declaration = classDeclarationSpan(parsed, operation.id)
    if (!classBlockToMove && !declaration) throw new SemanticValidationError(`Class ${operation.id} has no stable membership boundary`)
    const currentNamespace = parsed.classes.find(definition => definition.id === operation.id)?.parentId ?? null
    if (currentNamespace === operation.namespaceId) return []
    const range = classBlockToMove
      ? { start: classBlockToMove.opening.start, end: classBlockToMove.closing.fullEnd }
      : { start: declaration!.start, end: declaration!.fullEnd }
    const text = source.slice(range.start, range.end).trimEnd()
    const deleteOperation: SourceOperation = { kind: 'delete', range, expectedText: source.slice(range.start, range.end), expectedRevision: revision }
    if (!operation.namespaceId) {
      const topLevelText = text.split(/\r?\n/).map(line => line.trimStart()).join(newline)
      return [deleteOperation, { kind: 'insert', at: insertionPoint(parsed), text: `${insertionPrefix(source)}${topLevelText}`, expectedRevision: revision }]
    }
    const namespace = namespaceBlock(parsed, operation.namespaceId)
    if (!namespace) throw new SemanticValidationError(`Namespace ${operation.namespaceId} has no stable source boundary`)
    const indent = `${namespace.opening.text.match(/^\s*/)?.[0] ?? ''}  `
    const indented = text.split(/\r?\n/).map(line => `${indent}${line.trimStart()}`).join(newline)
    return [deleteOperation, { kind: 'insert', at: namespace.closing.start, text: `${indented}${newline}`, expectedRevision: revision }]
  }

  const namespace = namespaceBlock(parsed, operation.id)
  if (!namespace) throw new SemanticValidationError(`Namespace ${operation.id} has no stable source boundary`)
  return [
    fullLineOperation('delete', namespace.opening, source, revision),
    fullLineOperation('delete', namespace.closing, source, revision),
  ]
}
