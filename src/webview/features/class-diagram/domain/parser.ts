import type {
  ClassDefinition,
  ClassMember,
  ClassNamespace,
  ClassParseDiagnostic,
  ClassParseResult,
  ClassRelationship,
  ClassRelationshipType,
  ClassSourceMap,
  ClassVisibility,
} from './types'

type Scope = { kind: 'namespace'; id: string } | { kind: 'class'; id: string }

const identifiers = /^[A-Za-z_][A-Za-z0-9_-]*$/
const annotations = new Set(['interface', 'abstract', 'enumeration', 'service'])
const relationships: Array<{ token: string; type: ClassRelationshipType; reverse: boolean }> = [
  { token: '<|--', type: 'inheritance', reverse: true },
  { token: '--|>', type: 'inheritance', reverse: false },
  { token: '<|..', type: 'realization', reverse: true },
  { token: '..|>', type: 'realization', reverse: false },
  { token: '*--', type: 'composition', reverse: false },
  { token: '--*', type: 'composition', reverse: false },
  { token: 'o--', type: 'aggregation', reverse: false },
  { token: '--o', type: 'aggregation', reverse: false },
  { token: '<--', type: 'association', reverse: true },
  { token: '-->', type: 'association', reverse: false },
  { token: '<..', type: 'dependency', reverse: true },
  { token: '..>', type: 'dependency', reverse: false },
  { token: '--', type: 'link', reverse: false },
  { token: '..', type: 'link', reverse: false },
]

function visibility(value: string | undefined): ClassVisibility | undefined {
  return ({ '+': 'public', '-': 'private', '#': 'protected', '~': 'package' } as const)[value as '+' | '-' | '#' | '~']
}

function parseMember(raw: string, classId: string, ordinal: number): ClassMember | undefined {
  let text = raw.trim()
  if (!text || text.startsWith('<<')) return undefined
  const marker = /^[+\-#~]/.exec(text)?.[0]
  if (marker) text = text.slice(marker.length).trim()
  const suffix = /([*$])$/.exec(text)?.[1]
  if (suffix) text = text.slice(0, -1).trim()
  const common = {
    handle: `member:${classId}:${ordinal}`,
    visibility: visibility(marker),
    classifier: suffix === '$' ? 'static' as const : suffix === '*' ? 'abstract' as const : undefined,
  }
  const method = /^(.*?)\(([^)]*)\)\s*(.*)$/.exec(text)
  if (method) {
    const words = method[1].trim().split(/\s+/)
    const name = words.pop()
    if (!name || !identifiers.test(name)) return undefined
    return {
      ...common,
      name,
      compartment: 'method',
      ...(words.length ? { type: words.join(' ') } : {}),
      parameters: method[2].trim() ? method[2].split(',').map(item => item.trim()) : [],
      ...(method[3].trim() ? { returnType: method[3].trim() } : {}),
    }
  }
  const colon = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)$/.exec(text)
  if (colon) return { ...common, name: colon[1], compartment: 'attribute', type: colon[2].trim() }
  const words = text.split(/\s+/)
  const name = words.pop()
  if (!name || !identifiers.test(name)) return undefined
  return { ...common, name, compartment: 'attribute', ...(words.length ? { type: words.join(' ') } : {}) }
}

function parseAnnotation(value: string | undefined): ClassDefinition['annotation'] | undefined {
  const normalized = value?.toLowerCase()
  return normalized && annotations.has(normalized) ? normalized as ClassDefinition['annotation'] : undefined
}

function ensureClass(classes: Map<string, ClassDefinition>, id: string, parentId?: string): ClassDefinition {
  const existing = classes.get(id)
  if (existing) return existing
  const created: ClassDefinition = { id, label: id, genericParameters: [], ...(parentId ? { parentId } : {}), attributes: [], methods: [] }
  classes.set(id, created)
  return created
}

function parseRelationship(line: string, index: number): ClassRelationship | undefined {
  for (const relation of relationships) {
    const expression = new RegExp(`^([A-Za-z_][A-Za-z0-9_-]*)(?:\\s+"([^"]+)")?\\s+${relation.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(?:"([^"]+)"\\s+)?([A-Za-z_][A-Za-z0-9_-]*)(?:\\s*:\\s*(.+))?$`)
    const match = expression.exec(line)
    if (!match) continue
    const [, left, leftCardinality, rightCardinality, right, label] = match
    return {
      id: `relationship:${index}`,
      type: relation.type,
      source: relation.reverse ? right : left,
      target: relation.reverse ? left : right,
      ...(relation.reverse ? { sourceCardinality: rightCardinality, targetCardinality: leftCardinality } : { sourceCardinality: leftCardinality, targetCardinality: rightCardinality }),
      ...(label?.trim() ? { label: label.trim() } : {}),
    }
  }
  return undefined
}

function sourceRanges(source: string): Array<{ text: string; start: number; end: number }> {
  const result: Array<{ text: string; start: number; end: number }> = []
  const matcher = /.*(?:\r\n|\n|\r|$)/g
  let match: RegExpExecArray | null
  while ((match = matcher.exec(source)) !== null) {
    if (match[0] === '') break
    const newlineLength = match[0].endsWith('\r\n') ? 2 : /[\r\n]$/.test(match[0]) ? 1 : 0
    result.push({ text: match[0].slice(0, -newlineLength || undefined), start: match.index, end: match.index + match[0].length - newlineLength })
  }
  return result
}

function buildSourceMap(source: string): { sourceMap: ClassSourceMap; diagnostics: ClassParseDiagnostic[] } {
  const diagnostics: ClassParseDiagnostic[] = []
  let inFrontmatter = false
  const constructs = sourceRanges(source).map(span => {
    const line = span.text.trim()
    const range = { start: span.start, end: span.end }
    if (line === '---') {
      inFrontmatter = !inFrontmatter
      return { kind: 'frontmatter', ownership: 'preserved-only', range, text: span.text } as const
    }
    if (inFrontmatter) return { kind: 'frontmatter', ownership: 'preserved-only', range, text: span.text } as const
    if (line === 'classDiagram') return { kind: 'declaration', ownership: 'represented', range, text: span.text } as const
    if (!line || line.startsWith('%%')) return { kind: 'comment', ownership: 'preserved-only', range, text: span.text } as const
    if (/^(?:note|click|callback|link|style|cssClass|classDef|direction)\b/.test(line)) return { kind: 'directive', ownership: 'preserved-only', range, text: span.text } as const
    if (/^namespace\b/.test(line)) return { kind: 'namespace', ownership: 'represented', range, text: span.text } as const
    if (line === '}') return { kind: 'end', ownership: 'represented', range, text: span.text } as const
    if (/^class\s+/.test(line)) {
      if (/[`\[]/.test(line)) diagnostics.push({ code: 'unsupported-class-label', message: 'Class label syntax is outside the supported subset', range })
      return { kind: 'class', ownership: 'represented', range, text: span.text } as const
    }
    if (/\(\)--|--\(\)/.test(line)) diagnostics.push({ code: 'unsupported-lollipop-interface', message: 'Lollipop interface syntax is outside the supported subset', range })
    else if (/<\|--\|>/.test(line)) diagnostics.push({ code: 'unsupported-two-way-relationship', message: 'Two-way relationship markers are outside the supported subset', range })
    if (parseRelationship(line, span.start)) return { kind: 'relationship', ownership: 'editable', range, text: span.text } as const
    if (/^[A-Za-z_][A-Za-z0-9_-]*\s*:/.test(line) || /^[+\-#~]?[A-Za-z_]/.test(line)) return { kind: 'member', ownership: 'editable', range, text: span.text } as const
    return { kind: 'preserved-only', ownership: 'preserved-only', range, text: span.text } as const
  })
  return { sourceMap: { constructs }, diagnostics }
}

export function parseClassDiagram(source: string, revision = 1): ClassParseResult {
  const spans = sourceRanges(source)
  const lines = spans.map(span => span.text)
  if (!lines.some(line => line.trim() === 'classDiagram')) throw new Error('Expected a classDiagram declaration')

  const classes = new Map<string, ClassDefinition>()
  const namespaces: ClassNamespace[] = []
  const parsedRelationships: ClassRelationship[] = []
  const scopes: Scope[] = []
  const memberOrdinals = new Map<string, number>()
  let inFrontmatter = false

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim()
    if (line === '---') {
      inFrontmatter = !inFrontmatter
      continue
    }
    if (inFrontmatter || !line || line === 'classDiagram' || line.startsWith('%%') || line.startsWith('note ') || /^(?:click|callback|link|style|cssClass|classDef|direction)\b/.test(line)) continue
    if (line === '}') {
      scopes.pop()
      continue
    }

    const namespace = /^namespace\s+([A-Za-z_][A-Za-z0-9_-]*)\s*\{$/.exec(line)
    if (namespace) {
      const parent = scopes.at(-1)
      namespaces.push({ id: namespace[1], label: namespace[1], ...(parent?.kind === 'namespace' ? { parentId: parent.id } : {}) })
      scopes.push({ kind: 'namespace', id: namespace[1] })
      continue
    }

    const separateAnnotation = /^<<([A-Za-z]+)>>\s+([A-Za-z_][A-Za-z0-9_-]*)$/.exec(line)
    if (separateAnnotation) {
      ensureClass(classes, separateAnnotation[2]).annotation = parseAnnotation(separateAnnotation[1])
      continue
    }

    const relationship = parseRelationship(line, index)
    if (relationship) {
      ensureClass(classes, relationship.source)
      ensureClass(classes, relationship.target)
      parsedRelationships.push(relationship)
      continue
    }

    const classDefinition = /^class\s+([A-Za-z_][A-Za-z0-9_-]*)(?:~([^~]+)~)?(?:\s+<<([A-Za-z]+)>>)?(?:\s*\{)?$/.exec(line)
    if (classDefinition) {
      const parent = scopes.at(-1)
      const definition = ensureClass(classes, classDefinition[1], parent?.kind === 'namespace' ? parent.id : undefined)
      definition.genericParameters = classDefinition[2] ? classDefinition[2].split(',').map(item => item.trim()).filter(Boolean) : []
      definition.annotation = parseAnnotation(classDefinition[3]) ?? definition.annotation
      if (line.endsWith('{')) scopes.push({ kind: 'class', id: definition.id })
      continue
    }

    const statement = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.+)$/.exec(line)
    const owner = scopes.at(-1)
    const classId = statement?.[1] ?? (owner?.kind === 'class' ? owner.id : undefined)
    const memberText = statement?.[2] ?? (owner?.kind === 'class' ? line : undefined)
    if (!classId || !memberText) continue
    const definition = ensureClass(classes, classId, owner?.kind === 'namespace' ? owner.id : undefined)
    const blockAnnotation = /^<<([A-Za-z]+)>>$/.exec(memberText.trim())
    if (blockAnnotation) {
      definition.annotation = parseAnnotation(blockAnnotation[1]) ?? definition.annotation
      continue
    }
    const ordinal = memberOrdinals.get(classId) ?? 0
    const member = parseMember(memberText, classId, ordinal)
    if (!member) continue
    member.range = { start: spans[index].start, end: spans[index].end }
    memberOrdinals.set(classId, ordinal + 1)
    definition[member.compartment === 'attribute' ? 'attributes' : 'methods'].push(member)
  }

  const { sourceMap, diagnostics } = buildSourceMap(source)
  return {
    classes: [...classes.values()], namespaces, relationships: parsedRelationships, sourceMap, diagnostics,
    concrete: { source, revision, handles: [] },
  }
}
