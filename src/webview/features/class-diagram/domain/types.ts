export type ClassVisibility = 'public' | 'private' | 'protected' | 'package'
export type Classifier = 'static' | 'abstract'
export type ClassClassifier = Classifier
export type ClassRelationshipType = 'inheritance' | 'composition' | 'aggregation' | 'association' | 'dependency' | 'realization' | 'link'

export interface ClassMember {
  handle: string
  range?: { start: number; end: number }
  name: string
  compartment: 'attribute' | 'method'
  visibility?: ClassVisibility
  type?: string
  parameters?: string[]
  returnType?: string
  classifier?: Classifier
}

export interface ClassDefinition {
  id: string
  label: string
  genericParameters: string[]
  annotation?: 'interface' | 'abstract' | 'enumeration' | 'service'
  parentId?: string
  attributes: ClassMember[]
  methods: ClassMember[]
}

export interface ClassNamespace {
  id: string
  label: string
  parentId?: string
}

export interface ClassRelationship {
  id: string
  type: ClassRelationshipType
  source: string
  target: string
  sourceCardinality?: string
  targetCardinality?: string
  label?: string
}

export type ClassConstructOwnership = 'editable' | 'represented' | 'preserved-only'
export interface ClassSourceConstruct {
  kind: 'declaration' | 'class' | 'member' | 'relationship' | 'namespace' | 'end' | 'frontmatter' | 'comment' | 'directive' | 'preserved-only'
  ownership: ClassConstructOwnership
  range: { start: number; end: number }
  text: string
}
export interface ClassSourceMap {
  constructs: ClassSourceConstruct[]
}
export interface ClassParseDiagnostic {
  code: string
  message: string
  range: { start: number; end: number }
}

export interface ClassParseResult {
  classes: ClassDefinition[]
  namespaces: ClassNamespace[]
  relationships: ClassRelationship[]
  sourceMap: ClassSourceMap
  diagnostics: ClassParseDiagnostic[]
  concrete: { source: string; revision: number; handles: [] }
}
