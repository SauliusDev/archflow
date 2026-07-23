import type { Edge, Node, XYPosition } from "@xyflow/react";
import type {
  AdapterResult,
  EdgeAttachmentSide,
  EdgeRouteMode,
  FlowchartNodeConnections,
  LayoutGeometry,
  LayoutStateV2,
} from "../../shared/diagram-contracts";
import type { NewEdgeRouteMode } from "../../shared/protocol";
import type { DocumentSession } from "../lib/documentSession";
import type { ParseSuccess } from '@/features/flowchart';
import type {
  ClassAdapterModel,
  ClassSemanticOperation,
} from "../features/class-diagram";
import type {
  CanvasSnapshot,
  EdgeStyle,
  FlowEdgeData,
  FlowNodeData,
  NodeShape,
} from "../features/flowchart";

export const MAX_HISTORY = 100;
export const GRID_SNAP = 24;
export type SyncDirection = "canvas" | "code" | null;
export type PendingConnect =
  | { kind: "new"; sourceId: string; sourceSide?: EdgeAttachmentSide }
  | {
    kind: "reassign";
    edgeId: string;
    endpoint: "source" | "target";
    /** The endpoint that remains attached while the other follows the cursor. */
    fixedNodeId: string;
    fixedSide?: EdgeAttachmentSide;
    cursor?: { x: number; y: number };
    /** Ignore the release that activates reassignment; the next click chooses its target. */
    awaitingInitialRelease?: boolean;
  };

export interface DocumentSlice {
  documentSession: DocumentSession | null;
  codeSource: string;
  classDiagram: ClassAdapterModel | null;
  isDirty: boolean;
  initializeDocumentSession: (session: DocumentSession) => void;
  setInspectorVisible: (visible: boolean) => void;
  applyCodeSource: (source: string) => void;
  prepareDocumentSave: (
    content: string,
    layout: LayoutStateV2,
  ) => DocumentSession | null;
  acceptExternalDocument: (
    projection: AdapterResult,
    layout: LayoutStateV2,
    hostRevision: number,
    eventId: string,
  ) => void;
  acknowledgeDocumentSave: (acknowledgement: {
    eventId: string;
    sessionId: string;
    transactionId: string;
    workingRevision: number;
    hostRevision: number;
  }) => void;
  resolveDocumentConflict: (kind: "adopt-external" | "keep-local") => boolean;
  clearDirty: () => void;
}
export interface HistorySlice {
  history: { past: CanvasSnapshot[]; future: CanvasSnapshot[] };
  commitLegacyHistory: (next: CanvasSnapshot) => void;
  undo: () => void;
  redo: () => void;
}
export interface SelectionSlice {
  deselectAll: () => void;
  selectAll: () => void;
  selectOnly: (id: string) => void;
}
export interface CanvasSlice {
  nodes: Node<FlowNodeData>[];
  edges: Edge<FlowEdgeData>[];
  fitViewRequested: boolean;
  requestFitView: () => void;
  clearFitViewRequest: () => void;
  viewport: { x: number; y: number; zoom: number };
  viewportToRestore: { x: number; y: number; zoom: number } | null;
  setViewport: (vp: { x: number; y: number; zoom: number }) => void;
  requestViewportRestore: (vp: { x: number; y: number; zoom: number }) => void;
  clearViewportRestore: () => void;
  applyFlowChanges: (nodes: Node<FlowNodeData>[]) => void;
  applyEdgeFlowChanges: (edges: Edge<FlowEdgeData>[]) => void;
}
export interface WorkspaceUiSlice {
  filename: string;
  setFilename: (filename: string) => void;
  syncDirection: SyncDirection;
  setSyncDirection: (dir: SyncDirection) => void;
  pendingConnect: PendingConnect | null;
  setPendingConnect: (pending: PendingConnect | string | null, sourceSide?: EdgeAttachmentSide) => void;
  pendingConnectTargetId: string | null;
  setPendingConnectTargetId: (nodeId: string | null) => void;
  minimapOpen: boolean;
  toggleMinimap: () => void;
  isLocked: boolean;
  toggleLock: () => void;
  commandPaletteOpen: boolean;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  announcement: string | null;
  announce: (text: string) => void;
  clearAnnouncement: () => void;
  pendingAddNode: { shape: NodeShape; mermaidShape?: string } | null;
  requestAddNode: (shape: NodeShape, mermaidShape?: string) => void;
  clearPendingAddNode: () => void;
  pendingZoomAction: "in" | "out" | "reset" | "fit" | null;
  dispatchZoomAction: (type: "in" | "out" | "reset" | "fit") => void;
  clearPendingZoomAction: () => void;
}
export interface FlowchartSlice {
  addNode: (node: Node<FlowNodeData>) => void;
  addSubgraph: (position?: XYPosition) => void;
  addLane: () => void;
  renameLane: (id: string, label: string) => void;
  reorderLane: (id: string, beforeId: string) => void;
  deleteLane: (id: string, disposition: "promote" | "delete-contents") => void;
  setSubgraphDirection: (
    id: string,
    direction: "TB" | "TD" | "BT" | "RL" | "LR",
  ) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  updateNodeLabel: (id: string, label: string) => void;
  moveNodes: (
    updates: Array<{ id: string; position: XYPosition }>,
    beforePositions?: Readonly<Record<string, XYPosition>>,
  ) => void;
  applyAutoLayout: () => void;
  resizeNode: (
    id: string,
    dimensions: { width: number; height: number },
    position?: XYPosition,
  ) => void;
  removeEdge: (id: string) => void;
  removeEdges: (ids: string[]) => void;
  updateEdgeLabel: (id: string, label: string) => void;
  addEdge: (connection: {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    sourceSide?: EdgeAttachmentSide;
  }, routeMode?: NewEdgeRouteMode) => void;
  setEdgeStyle: (id: string, style: EdgeStyle) => void;
  setEdgeRouteMode: (id: string, routeMode: EdgeRouteMode) => void;
  setNodeConnectionPolicy: (policy: FlowchartNodeConnections) => void;
  setEdgeAttachmentSide: (
    id: string,
    endpoint: "source" | "target",
    side: EdgeAttachmentSide,
  ) => void;
  retargetEdgeEndpoint: (
    id: string,
    endpoint: "source" | "target",
    nodeId: string,
    side?: EdgeAttachmentSide,
  ) => void;
  addEdgeWaypoint: (id: string, point: { x: number; y: number }) => void;
  moveEdgeWaypoint: (
    id: string,
    index: number,
    point: { x: number; y: number },
  ) => void;
  removeEdgeWaypoint: (id: string, index: number) => void;
  assignToSubgraph: (
    nodeId: string,
    subgraphId: string,
    relativePosition: XYPosition,
  ) => void;
  removeFromSubgraph: (nodeId: string, absolutePosition: XYPosition) => void;
  spawnConnectedNode: (sourceId: string, position: XYPosition, routeMode?: NewEdgeRouteMode, sourceSide?: EdgeAttachmentSide) => void;
  updateNodeShape: (id: string, shape: NodeShape) => void;
  duplicateNode: (id: string) => void;
  duplicateNodes: (ids: string[]) => void;
  toggleNodeLock: (id: string) => void;
  updateNodeColors: (
    id: string,
    colors: { fillColor?: string; strokeColor?: string; strokeWidth?: 1 | 2 | 3 | 4 | 6; textColor?: string },
  ) => void;
  updateNodeStrokeWidth: (id: string, strokeWidth: 1 | 2 | 3 | 4 | 6) => void;
  updateNodeTextAlignment: (
    id: string,
    alignment: { horizontal?: 'left' | 'center' | 'right'; vertical?: 'top' | 'center' | 'bottom' },
  ) => void;
  toggleNodeHandDrawn: (id: string) => void;
  importFromCode: (result: ParseSuccess) => void;
}
export interface ClassDiagramSlice {
  applyClassOperation: (operation: ClassSemanticOperation) => void;
  updateClassGeometry: (id: string, geometry: LayoutGeometry) => void;
}
export type FlowforgeState = DocumentSlice &
  HistorySlice &
  SelectionSlice &
  CanvasSlice &
  WorkspaceUiSlice &
  FlowchartSlice &
  ClassDiagramSlice;
