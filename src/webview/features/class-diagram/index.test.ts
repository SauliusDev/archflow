import { describe, expect, it } from 'vitest'
import {
  classAdapter,
  classDagreStrategy,
  issueClassOperation,
  parseClassDiagram,
  type ClassAdapterModel,
  type ClassClassifier,
  type ClassDefinition,
  type ClassMember,
  type ClassNamespace,
  type ClassParseDiagnostic,
  type ClassParseResult,
  type ClassRelationship,
  type ClassRelationshipType,
  type ClassSemanticOperation,
  type ClassSourceConstruct,
  type ClassSourceMap,
  type ClassVisibility,
} from './index'

describe('class-diagram feature public API', () => {
  it('exposes class contracts, operations, adapter, parser, and layout from one boundary', () => {
    const visibility: ClassVisibility = 'public'
    const classifier: ClassClassifier = 'static'
    const relationshipType: ClassRelationshipType = 'association'
    const member: ClassMember = { handle: 'member:Account:0', name: 'owner', compartment: 'attribute', visibility, classifier }
    const definition: ClassDefinition = { id: 'Account', label: 'Account', genericParameters: [], attributes: [member], methods: [] }
    const namespace: ClassNamespace = { id: 'Domain', label: 'Domain' }
    const relationship: ClassRelationship = { id: 'relationship:0', type: relationshipType, source: 'Account', target: 'Ledger' }
    const construct: ClassSourceConstruct = {
      kind: 'class', ownership: 'represented', range: { start: 0, end: 13 }, text: 'class Account',
    }
    const sourceMap: ClassSourceMap = { constructs: [construct] }
    const diagnostic: ClassParseDiagnostic = { code: 'example', message: 'Example', range: { start: 0, end: 0 } }
    const parsed: ClassParseResult = {
      classes: [definition], namespaces: [namespace], relationships: [relationship], sourceMap, diagnostics: [diagnostic],
      concrete: { source: 'classDiagram', revision: 1, handles: [] },
    }
    const model: ClassAdapterModel = parsed
    const operation: ClassSemanticOperation = { kind: 'rename-class', id: 'Account', label: 'Ledger' }

    expect(typeof parseClassDiagram).toBe('function')
    expect(typeof issueClassOperation).toBe('function')
    expect(typeof classAdapter.parse).toBe('function')
    expect(typeof classDagreStrategy.layout).toBe('function')
    expect([model.classes[0].id, operation.kind]).toEqual(['Account', 'rename-class'])
  })
})
