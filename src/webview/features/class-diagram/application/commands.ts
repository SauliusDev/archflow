import { SemanticValidationError, type CommandResult, type LayoutGeometry, type LayoutStateV2 } from '../../../../shared/diagram-contracts'
import type { DocumentSession } from '../../../lib/documentSession'
import { commitDocumentTransaction, commitSourceOperationTransaction } from '../../../lib/documentSession'
import { issueClassOperation, type ClassSemanticOperation } from '../domain/operations'
import { classAdapter, type ClassAdapterModel } from './adapter'

export interface CommandDependencies { createId(): string }

const CLASS_DEFAULT_GEOMETRY: LayoutGeometry = { x: 48, y: 48, width: 180, height: 120 }
const NAMESPACE_DEFAULT_GEOMETRY: LayoutGeometry = { x: 48, y: 48, width: 320, height: 240 }

export function describeClassOperation(operation: ClassSemanticOperation): string {
  switch (operation.kind) {
    case 'add-class': return `Add class ${operation.id}`
    case 'add-namespace': return `Add namespace ${operation.id}`
    case 'rename-class': return `Rename class ${operation.id}`
    case 'delete-class': return `Delete class ${operation.id}`
    case 'add-member': return `Add member to ${operation.classId}`
    case 'edit-member': return `Edit member ${operation.handle}`
    case 'reorder-member': return `Reorder member ${operation.handle}`
    case 'delete-member': return `Delete member ${operation.handle}`
    case 'set-visibility': return `Set visibility for ${operation.handle}`
    case 'set-classifier': return `Set classifier for ${operation.handle}`
    case 'set-annotation': return `Set annotation for ${operation.id}`
    case 'add-relationship': return `Add relationship ${operation.source} to ${operation.target}`
    case 'update-relationship': return `Update relationship ${operation.id}`
    case 'reverse-relationship': return `Reverse relationship ${operation.id}`
    case 'delete-relationship': return `Delete relationship ${operation.id}`
    case 'set-cardinality': return `Set cardinality for ${operation.id}`
    case 'move-class-to-namespace': return `Move class ${operation.id}`
    case 'delete-namespace': return `Delete namespace ${operation.id}`
  }
}

export function classLayoutForOperation(session: DocumentSession, operation: ClassSemanticOperation): LayoutStateV2 {
  const elements = { ...session.layout.elements }
  const model = session.projection.model as ClassAdapterModel
  if (operation.kind === 'add-class') elements[`class:${operation.id}`] = { ...CLASS_DEFAULT_GEOMETRY, x: CLASS_DEFAULT_GEOMETRY.x + model.classes.length * 24, y: CLASS_DEFAULT_GEOMETRY.y + model.classes.length * 24 }
  else if (operation.kind === 'add-namespace') elements[`namespace:${operation.id}`] = NAMESPACE_DEFAULT_GEOMETRY
  else if (operation.kind === 'delete-class') delete elements[`class:${operation.id}`]
  else if (operation.kind === 'move-class-to-namespace') {
    const definition = model.classes.find(item => item.id === operation.id)
    const handle = `class:${operation.id}`
    const geometry = elements[handle] ?? CLASS_DEFAULT_GEOMETRY
    const current = definition?.parentId ? elements[`namespace:${definition.parentId}`] : undefined
    const target = operation.namespaceId ? elements[`namespace:${operation.namespaceId}`] : undefined
    if (operation.namespaceId && target) elements[handle] = { ...geometry, x: geometry.x - (current?.x ?? 0) - target.x, y: geometry.y - (current?.y ?? 0) - target.y }
    else if (current) elements[handle] = { ...geometry, x: geometry.x + current.x, y: geometry.y + current.y }
  } else if (operation.kind === 'delete-namespace') {
    const namespace = elements[`namespace:${operation.id}`]
    if (namespace) for (const definition of model.classes.filter(item => item.parentId === operation.id)) {
      const handle = `class:${definition.id}`
      const geometry = elements[handle]
      if (geometry) elements[handle] = { ...geometry, x: geometry.x + namespace.x, y: geometry.y + namespace.y }
    }
    delete elements[`namespace:${operation.id}`]
  }
  return { ...session.layout, elements }
}

function failure(error: unknown): CommandResult<never> {
  return { ok: false, code: 'internal-error', message: 'Unexpected diagram command failure', cause: error }
}

function invalidOperationFailure(error: unknown): CommandResult<never> {
  return { ok: false, code: 'invalid-operation', message: error instanceof Error ? error.message : String(error), cause: error }
}

function semanticPlanningFailure(error: unknown): CommandResult<never> {
  return error instanceof SemanticValidationError ? invalidOperationFailure(error) : failure(error)
}

export function executeClassDiagramCommand(session: DocumentSession, operation: ClassSemanticOperation, dependencies: CommandDependencies): CommandResult<DocumentSession> {
  if (session.family !== 'class') return { ok: false, code: 'unsupported-family', message: 'This command requires a class diagram document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  let operations
  try {
    operations = issueClassOperation(session.projection.model as ClassAdapterModel, operation)
  } catch (error) {
    return semanticPlanningFailure(error)
  }
  try {
    if (operations.length === 0) return { ok: false, code: 'invalid-operation', message: 'Operation produced no source changes' }
    const committed = commitSourceOperationTransaction(session, {
      id: dependencies.createId(), description: describeClassOperation(operation), operations, layout: classLayoutForOperation(session, operation),
    }, (source, revision) => classAdapter.parse(source, revision))
    return committed.success
      ? { ok: true, value: committed.session }
      : { ok: false, code: /stale|revision/i.test(committed.error) ? 'stale-transaction' : 'invalid-source', message: committed.error }
  } catch (error) { return failure(error) }
}

export function executeClassGeometryCommand(session: DocumentSession, id: string, geometry: LayoutGeometry, dependencies: CommandDependencies): CommandResult<DocumentSession> {
  if (session.family !== 'class') return { ok: false, code: 'unsupported-family', message: 'This command requires a class diagram document' }
  if (session.conflict) return { ok: false, code: 'external-conflict', message: 'Document has an unresolved external change' }
  try {
    const handle = `class:${id}`
    if (JSON.stringify(session.layout.elements[handle]) === JSON.stringify(geometry)) return { ok: false, code: 'invalid-operation', message: 'Geometry did not change' }
    const layoutAfter = { ...session.layout, elements: { ...session.layout.elements, [handle]: geometry } }
    const committed = commitDocumentTransaction(session, {
      id: dependencies.createId(), family: 'class', baseRevision: session.workingRevision, resultRevision: session.workingRevision + 1,
      forward: [], inverse: [], layoutBefore: session.layout, layoutAfter, selectionBefore: session.selection, selectionAfter: [handle], description: `Update geometry for class ${id}`,
    }, (source, revision) => classAdapter.parse(source, revision))
    return committed.success ? { ok: true, value: committed.session } : { ok: false, code: 'invalid-source', message: committed.error }
  } catch (error) { return failure(error) }
}
