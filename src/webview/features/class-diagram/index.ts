export { parseClassDiagram } from "./domain/parser";
export { serializeClassDiagram } from "./domain/serializer";
export {
  issueClassMemberReplacement,
  issueClassOperation,
} from "./domain/operations";
export type { ClassSemanticOperation } from "./domain/operations";
export type {
  ClassClassifier,
  ClassConstructOwnership,
  ClassDefinition,
  ClassMember,
  ClassNamespace,
  ClassParseDiagnostic,
  ClassParseResult,
  ClassRelationship,
  ClassRelationshipType,
  ClassSourceConstruct,
  ClassSourceMap,
  ClassVisibility,
  Classifier,
} from "./domain/types";
export { classAdapter } from "./application/adapter";
export type { ClassAdapterModel } from "./application/adapter";
export { classDagreStrategy, restoreClassLayout } from "./application/layout";
export {
  classLayoutForOperation,
  describeClassOperation,
  executeClassDiagramCommand,
  executeClassGeometryCommand,
} from "./application/commands";
export type { CommandDependencies } from "./application/commands";

export { createClassDiagramSlice } from "./state/createClassDiagramSlice";
export { default as ClassDiagramCanvas } from './ui/ClassDiagramCanvas';
export { ClassNode, classNodeDimensions } from './ui/ClassNode';
export { ClassRelationshipEdge } from './ui/ClassRelationshipEdge';
export { NamespaceNode, namespaceContains, toNamespaceRelativePosition } from './ui/NamespaceNode';
