import type { AdapterDescriptor, AdapterResult, ConcreteSourceHandle } from '../../../../shared/diagram-contracts'
import { parseClassDiagram } from '../domain/parser'
import type { ClassParseResult } from '../domain/types'

export type ClassAdapterModel = ClassParseResult

function toAdapterResult(source: string, revision: number): AdapterResult<ClassAdapterModel> {
  const model = parseClassDiagram(source, revision)
  const handles: ConcreteSourceHandle[] = model.classes.flatMap(definition =>
    [...definition.attributes, ...definition.methods]
      .filter(member => member.range)
      .map(member => ({
        handle: member.handle,
        kind: member.compartment,
        range: member.range!,
        fingerprint: source.slice(member.range!.start, member.range!.end),
      })),
  )
  const classIds = new Set(model.classes.map(definition => definition.id))
  const namespaceElements = model.namespaces.map(namespace => ({
    id: `namespace:${namespace.id}`,
    kind: 'container' as const,
    label: namespace.label,
    focusable: true,
    selected: false,
    disabled: false,
    operations: ['rename-namespace', 'delete-namespace'],
    ...(namespace.parentId ? { parentId: `namespace:${namespace.parentId}` } : {}),
  }))
  const classElements = model.classes.map(definition => ({
    id: `class:${definition.id}`,
    kind: 'element' as const,
    label: definition.label,
    focusable: true,
    selected: false,
    disabled: false,
    operations: ['rename-class', 'delete-class', 'add-member'],
    ...(definition.parentId ? { parentId: `namespace:${definition.parentId}` } : {}),
    metadata: { annotation: definition.annotation, genericParameters: definition.genericParameters },
  }))
  const memberElements = model.classes.flatMap(definition =>
    [...definition.attributes, ...definition.methods].map(member => ({
      id: member.handle,
      kind: 'compartment' as const,
      label: member.name,
      focusable: true,
      selected: false,
      disabled: false,
      operations: ['edit-member', 'delete-member', 'reorder-member'],
      parentId: `class:${definition.id}`,
      metadata: { compartment: member.compartment, visibility: member.visibility, classifier: member.classifier },
    })),
  )
  return {
    family: 'class',
    model,
    concrete: { source, revision, handles },
    canvas: {
      elements: [...namespaceElements, ...classElements, ...memberElements],
      connectors: model.relationships
        .filter(relationship => classIds.has(relationship.source) && classIds.has(relationship.target))
        .map(relationship => ({
          id: relationship.id,
          source: `class:${relationship.source}`,
          target: `class:${relationship.target}`,
          label: relationship.label,
          operations: ['update-relationship', 'delete-relationship', 'reverse-relationship'],
          metadata: { type: relationship.type, sourceCardinality: relationship.sourceCardinality, targetCardinality: relationship.targetCardinality },
        })),
    },
    diagnostics: model.diagnostics.map(diagnostic => ({ severity: 'error' as const, ...diagnostic })),
  }
}

export const classAdapter: AdapterDescriptor<ClassAdapterModel> = {
  id: 'class-diagram',
  family: 'class',
  capabilities: Object.freeze({ visualEdit: true, preview: true, losslessOperations: true }),
  parse: toAdapterResult,
  supportsOperation: operation => ({
    supported: [
      'add-class', 'add-namespace', 'rename-class', 'delete-class', 'add-member', 'edit-member', 'reorder-member', 'delete-member',
      'set-visibility', 'set-classifier', 'set-annotation', 'add-relationship', 'update-relationship',
      'reverse-relationship', 'delete-relationship', 'move-class-to-namespace', 'delete-namespace',
    ].includes(operation),
    reason: 'Class diagrams support class, member, relationship, and namespace operations',
  }),
  validateSource: source => {
    try {
      const parsed = parseClassDiagram(source)
      return parsed.diagnostics.length === 0
        ? { valid: true }
        : { valid: false, error: parsed.diagnostics.map(diagnostic => diagnostic.message).join('; ') }
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) }
    }
  },
  layoutStrategyId: 'class-dagre',
}
