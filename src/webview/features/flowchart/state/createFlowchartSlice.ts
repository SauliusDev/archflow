import type { StateCreator } from "zustand";
import type { FlowforgeState, FlowchartSlice } from "../../../state/types";
import type { Node, Edge, XYPosition } from "@xyflow/react";
import type {
  DocumentSession,
} from "../../../lib/documentSession";
import { flowchartNodeConnections, type CommandResult, type EdgeAttachmentSide, type LayoutStateV2 } from "../../../../shared/diagram-contracts";
import { executeFlowchartNodeConnectionCommand } from "../application/commands";
import { reportCommandFailure } from "../../../state/commandReporting";
import {
  commitFlowchartGeometryTransaction,
  executeFlowchartAutoLayoutCommand,
  executeFlowchartCommand,
  executeFlowchartEdgeRoutingCommand,
  executeFlowchartTextAlignmentCommand,
  executeFlowchartLaneCommand,
  executeFlowchartSubgraphCommand,
  executeFlowchartSubgraphMembershipCommand,
  flowchartTextAlignment,
  materializeFlowchartSourceImportLayout,
  nodeGeometry,
  planFlowchartAutoLayout,
  planFlowchartSubgraph,
  planFlowchartSubgraphMembership,
  projectFlowchartSession,
  type FlowchartAdapterModel,
  withFlowchartRoute,
  withFlowchartTextAlignment,
  type FlowchartSemanticOperation,
  type FlowEdgeData,
  type FlowNodeData,
} from "..";
import { allocateCompactIdentifier, isLegacyGeneratedIdentifier } from "../domain/compactIdentifiers";
import { GRID_SNAP } from "../../../state/types";
import { resolveEdgeAttachment } from "../../../lib/floatingEdge";

const NODE_COLLISION_GAP = 1;

function normalizeShapeGeometry(node: Node<FlowNodeData>, shape: FlowNodeData['shape']): Node<FlowNodeData> {
  if (shape !== 'circle' && shape !== 'diamond') return { ...node, data: { ...node.data, shape } };
  const width = node.width ?? node.measured?.width ?? 120;
  const height = node.height ?? node.measured?.height ?? 60;
  // Keep the new square inside the previous bounds. Expanding to the longest
  // side made a wide rectangular node turn into an unexpectedly huge circle.
  const size = Math.min(width, height);
  return {
    ...node,
    data: { ...node.data, shape },
    width: size,
    height: size,
    position: { x: node.position.x + (width - size) / 2, y: node.position.y + (height - size) / 2 },
  };
}

function absoluteNodePosition(
  node: Node<FlowNodeData>,
  byId: ReadonlyMap<string, Node<FlowNodeData>>,
  positions: ReadonlyMap<string, XYPosition>,
): XYPosition {
  const position = positions.get(node.id) ?? node.position;
  if (!node.parentId) return position;
  const parent = byId.get(node.parentId);
  if (!parent) return position;
  const parentPosition = absoluteNodePosition(parent, byId, positions);
  return { x: parentPosition.x + position.x, y: parentPosition.y + position.y };
}

function optimalAttachmentSide(
  source: Node<FlowNodeData>,
  target: Node<FlowNodeData>,
  nodes: readonly Node<FlowNodeData>[],
): EdgeAttachmentSide {
  const nodeById = new Map(nodes.map(node => [node.id, node] as const));
  const positions = new Map(nodes.map(node => [node.id, node.position] as const));
  const internalNode = (node: Node<FlowNodeData>) => ({
    measured: { width: node.width ?? node.measured?.width ?? 160, height: node.height ?? node.measured?.height ?? 64 },
    internals: { positionAbsolute: absoluteNodePosition(node, nodeById, positions) },
  });
  return resolveEdgeAttachment(internalNode(source) as never, internalNode(target) as never).side as EdgeAttachmentSide;
}

function connectionAttachmentSides(
  nodes: readonly Node<FlowNodeData>[],
  sourceId: string,
  targetId: string,
  requestedSourceSide?: EdgeAttachmentSide,
): { sourceSide: EdgeAttachmentSide; targetSide: EdgeAttachmentSide } | undefined {
  const source = nodes.find(node => node.id === sourceId);
  const target = nodes.find(node => node.id === targetId);
  if (!source || !target) return undefined;
  return {
    sourceSide: requestedSourceSide ?? optimalAttachmentSide(source, target, nodes),
    targetSide: optimalAttachmentSide(target, source, nodes),
  };
}

function overlapsNode(
  moving: Node<FlowNodeData>,
  candidate: XYPosition,
  other: Node<FlowNodeData>,
  byId: ReadonlyMap<string, Node<FlowNodeData>>,
  positions: ReadonlyMap<string, XYPosition>,
): boolean {
  const movingPosition = absoluteNodePosition(
    moving,
    byId,
    new Map(positions).set(moving.id, candidate),
  );
  const otherPosition = absoluteNodePosition(other, byId, positions);
  const movingWidth = moving.width ?? moving.measured?.width ?? 160;
  const movingHeight = moving.height ?? moving.measured?.height ?? 64;
  const otherWidth = other.width ?? other.measured?.width ?? 160;
  const otherHeight = other.height ?? other.measured?.height ?? 64;
  return (
    movingPosition.x < otherPosition.x + otherWidth + NODE_COLLISION_GAP &&
    movingPosition.x + movingWidth + NODE_COLLISION_GAP > otherPosition.x &&
    movingPosition.y < otherPosition.y + otherHeight + NODE_COLLISION_GAP &&
    movingPosition.y + movingHeight + NODE_COLLISION_GAP > otherPosition.y
  );
}

/** Keep an explicit move from putting two visible diagram shapes on top of each other.
 * This is especially important for arrow-key moves, which can cross a narrow gap in
 * one 8px increment after a layout restore. Containers are deliberately excluded:
 * their purpose is to enclose child nodes. */
function collisionFreeNodePosition(
  node: Node<FlowNodeData>,
  requested: XYPosition,
  nodes: readonly Node<FlowNodeData>[],
  movingIds: ReadonlySet<string>,
): XYPosition {
  if (node.data.isSubgraph) return requested;
  const byId = new Map(nodes.map((item) => [item.id, item]));
  const positions = new Map(nodes.map((item) => [item.id, item.position]));
  const obstacles = nodes.filter(
    (item) =>
      item.id !== node.id && !movingIds.has(item.id) && !item.data.isSubgraph,
  );
  const collides = (position: XYPosition) =>
    obstacles.some((other) =>
      overlapsNode(node, position, other, byId, positions),
    );
  if (!collides(requested)) return requested;
  if (collides(node.position)) return node.position;

  let low = 0;
  let high = 1;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const middle = (low + high) / 2;
    const candidate = {
      x: node.position.x + (requested.x - node.position.x) * middle,
      y: node.position.y + (requested.y - node.position.y) * middle,
    };
    if (collides(candidate)) high = middle;
    else low = middle;
  }
  return {
    x: node.position.x + (requested.x - node.position.x) * low,
    y: node.position.y + (requested.y - node.position.y) * low,
  };
}

type FlowchartSemanticOperationResult =
  | (Extract<CommandResult<DocumentSession>, { ok: true }> & { success: true; session: DocumentSession })
  | (Extract<CommandResult<DocumentSession>, { ok: false }> & { success: false; session: DocumentSession; error: string });

function projectSessionModel(
  session: DocumentSession,
  nodes: Node<FlowNodeData>[],
  includeSelection = true,
) {
  return projectFlowchartSession(session, nodes, includeSelection);
}

function nextFlowchartEdgeId(session: DocumentSession, source: string, target: string): string {
  const existing = new Set((session.projection.model as FlowchartAdapterModel).edges.map(edge => edge.id))
  return allocateCompactIdentifier("edge", existing)
}

function occupiedFlowchartElementIds(
  nodes: readonly Node<FlowNodeData>[],
  session?: DocumentSession | null,
): Set<string> {
  const occupied = new Set(nodes.map(node => node.id));
  if (session?.family === "flowchart") {
    for (const node of (session.projection.model as FlowchartAdapterModel).nodes) {
      occupied.add(node.id);
    }
  }
  return occupied;
}

function duplicateNodeLayout(
  layout: LayoutStateV2,
  copies: readonly Node<FlowNodeData>[],
  sourceIds: readonly string[],
): LayoutStateV2 {
  let next = {
    ...layout,
    elements: {
      ...layout.elements,
      ...Object.fromEntries(copies.map((node) => [`node:${node.id}`, nodeGeometry(node)])),
    },
  };
  for (const [index, copy] of copies.entries()) {
    const alignment = flowchartTextAlignment(layout, sourceIds[index]);
    if (alignment) next = withFlowchartTextAlignment(next, copy.id, alignment);
  }
  return next;
}

function duplicateNodeColorOperation(node: Node<FlowNodeData>): FlowchartSemanticOperation | null {
  const { fillColor, strokeColor, strokeWidth, textColor } = node.data;
  if (fillColor === undefined && strokeColor === undefined && strokeWidth === undefined && textColor === undefined) return null;
  return { kind: "update-node-colors", id: node.id, fillColor, strokeColor, strokeWidth, textColor };
}

function legacyRouteDataEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => legacyRouteDataEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key)
      && legacyRouteDataEqual(leftRecord[key], rightRecord[key]));
}

export function commitFlowchartSemanticOperations(
  session: DocumentSession,
  operations: readonly FlowchartSemanticOperation[],
  description: string,
  selection?: string[],
  layout?: LayoutStateV2,
): FlowchartSemanticOperationResult {
  const result = executeFlowchartCommand(
    session,
    { operations, description, selection, layout },
    { createId: () => crypto.randomUUID() },
  );
  return result.ok
    ? { ...result, success: true, session: result.value }
    : { ...result, success: false, session, error: result.message };
}

function unexpectedCommandFailure(error: unknown): CommandResult<never> {
  return { ok: false, code: "internal-error", message: "Unexpected diagram command failure", cause: error };
}

function reportFlowchartSessionGuard(
  session: DocumentSession,
  context: string,
  set: (partial: Pick<FlowforgeState, "announcement">) => void,
): boolean {
  if (session.family !== "flowchart") {
    set(reportCommandFailure({ ok: false, code: "unsupported-family", message: "This command requires a flowchart document" }, context));
    return false;
  }
  if (session.conflict) {
    set(reportCommandFailure({ ok: false, code: "external-conflict", message: "Document has an unresolved external change" }, context));
    return false;
  }
  return true;
}
export const createFlowchartSlice: StateCreator<
  FlowforgeState,
  [],
  [],
  FlowchartSlice
> = (set, get) => ({
  addNode: (node) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "add node", set))) return;
    const visualId = isLegacyGeneratedIdentifier(node.id, "node")
      ? allocateCompactIdentifier("node", occupiedFlowchartElementIds(nodes, documentSession))
      : node.id;
    const visualNode = visualId === node.id ? node : { ...node, id: visualId };
    if (
      documentSession &&
      documentSession.source.trim()
    ) {
      try {
        const semanticId = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(visualNode.id)
          ? visualNode.id
          : `N_${visualNode.id.replace(/[^A-Za-z0-9_-]/g, "_")}`;
        const sourceNode =
          semanticId === visualNode.id ? visualNode : { ...visualNode, id: semanticId };
        const committed = executeFlowchartCommand(
          documentSession,
          {
            operations: [
              {
                kind: "add-node",
                id: semanticId,
                label: node.data.label,
                shape:
                  node.data.shape === "subgraph"
                    ? "rectangle"
                    : node.data.shape,
                mermaidShape: node.data.mermaidShape,
              },
            ],
            description: `Add node ${semanticId}`,
            selection: [`node:${semanticId}`],
          },
          { createId: () => crypto.randomUUID() },
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "add node"));
          return;
        }
        const projected = projectSessionModel(committed.value, [
          ...nodes,
          sourceNode,
        ]);
        set({
          documentSession: committed.value,
          codeSource: committed.value.source,
          ...projected,
          isDirty: committed.value.dirty,
          announcement: "Node added",
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "add node"));
        return;
      }
    }
    // addNode is never a no-op — always appends
    get().commitLegacyHistory({ nodes: [...nodes, visualNode], edges });
    set({ announcement: "Node added" });
  },

  addSubgraph: (position) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked) return;
    if (documentSession && !reportFlowchartSessionGuard(documentSession, "add subgraph", set)) return;
    const id = allocateCompactIdentifier("subgraph", occupiedFlowchartElementIds(nodes, documentSession));
    if (documentSession) {
      const result = executeFlowchartSubgraphCommand(
        documentSession,
        { id, position, nodes },
        { createId: () => crypto.randomUUID() },
      );
      if (!result.ok) {
        set(reportCommandFailure(result, "add subgraph"));
        return;
      }
      const projected = projectSessionModel(
        result.value.session,
        result.value.nodes,
      );
      set({
        documentSession: result.value.session,
        codeSource: result.value.session.source,
        ...projected,
        isDirty: result.value.session.dirty,
        announcement: "Node added",
      });
      return;
    }
    get().commitLegacyHistory({
      nodes: planFlowchartSubgraph({ id, position, nodes }).nodes,
      edges,
    });
    set({ announcement: "Node added" });
  },

  addLane: () => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) return;
    if (!reportFlowchartSessionGuard(documentSession, "add lane", set)) return;
    const id = allocateCompactIdentifier("subgraph", occupiedFlowchartElementIds(nodes, documentSession));
    const result = executeFlowchartLaneCommand(
      documentSession,
      { kind: "add", id },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "add lane"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      ...projected,
      isDirty: result.value.dirty,
      announcement: "Lane added",
    });
  },

  renameLane: (id, label) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) return;
    if (!reportFlowchartSessionGuard(documentSession, "rename lane", set)) return;
    const result = executeFlowchartLaneCommand(
      documentSession,
      { kind: "rename", id, label },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "rename lane"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      ...projected,
      isDirty: result.value.dirty,
      announcement: "Lane renamed",
    });
  },

  reorderLane: (id, beforeId) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) return;
    if (!reportFlowchartSessionGuard(documentSession, "reorder lane", set)) return;
    const result = executeFlowchartLaneCommand(
      documentSession,
      { kind: "reorder", id, beforeId },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "reorder lane"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      ...projected,
      isDirty: result.value.dirty,
      announcement: "Lane reordered",
    });
  },

  deleteLane: (id, disposition) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) return;
    if (!reportFlowchartSessionGuard(documentSession, "delete lane", set)) return;
    const result = executeFlowchartLaneCommand(
      documentSession,
      { kind: "delete", id, disposition },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "delete lane"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      ...projected,
      isDirty: result.value.dirty,
      announcement: "Lane deleted",
    });
  },

  setSubgraphDirection: (id, direction) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) return;
    if (!reportFlowchartSessionGuard(documentSession, "set subgraph direction", set)) return;
    const result = executeFlowchartLaneCommand(
      documentSession,
      { kind: "set-direction", id, direction },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "set subgraph direction"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      ...projected,
      isDirty: result.value.dirty,
      announcement: `Direction ${direction}`,
    });
  },

  removeNodes: (ids) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "delete nodes", set))) return;
    const idSet = new Set(ids);
    const nextNodes = nodes.filter((n) => !idSet.has(n.id));
    if (nextNodes.length === nodes.length) return; // none matched — no-op

    // Promote direct children of deleted subgraphs to top-level
    const deletedSubgraphIds = nodes
      .filter((n) => idSet.has(n.id) && n.data.isSubgraph)
      .map((n) => n.id);

    let result = nextNodes;
    if (deletedSubgraphIds.length > 0) {
      const deletedSgSet = new Set(deletedSubgraphIds);
      result = nextNodes.map((n) => {
        if (!n.parentId || !deletedSgSet.has(n.parentId)) return n;
        const sg = nodes.find((p) => p.id === n.parentId)!;
        const { parentId: _p, extent: _e, ...rest } = n;
        return {
          ...rest,
          position: {
            x: n.position.x + sg.position.x,
            y: n.position.y + sg.position.y,
          },
        };
      });
    }

    const nextEdges = edges.filter(
      (e) => !idSet.has(e.source) && !idSet.has(e.target),
    );
    if (documentSession) {
      try {
        const committed = commitFlowchartSemanticOperations(
          documentSession,
          ids.map((id) => ({ kind: "delete-node" as const, id })),
          `Delete ${ids.length} node(s)`,
          [],
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "delete nodes"));
          return;
        }
        const projected = projectSessionModel(committed.value, result);
        set({
          documentSession: committed.value,
          codeSource: committed.value.source,
          ...projected,
          isDirty: committed.value.dirty,
          announcement: `Deleted ${ids.length} node${ids.length > 1 ? "s" : ""}`,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "delete nodes"));
        return;
      }
    }
    get().commitLegacyHistory({ nodes: result, edges: nextEdges });
    set({
      announcement: `Deleted ${ids.length} node${ids.length > 1 ? "s" : ""}`,
    });
  },

  removeNode: (id) => {
    get().removeNodes([id]);
  },

  removeEdges: (ids) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "delete edges", set))) return;
    const idSet = new Set(ids);
    const nextEdges = edges.filter((e) => !idSet.has(e.id));
    if (nextEdges.length === edges.length) return;
    if (documentSession) {
      try {
        const committed = commitFlowchartSemanticOperations(
          documentSession,
          ids.map((id) => ({ kind: "delete-edge" as const, id })),
          `Delete ${ids.length} edge(s)`,
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "delete edges"));
          return;
        }
        const projected = projectSessionModel(committed.value, nodes);
        set({
          documentSession: committed.value,
          codeSource: committed.value.source,
          ...projected,
          isDirty: committed.value.dirty,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "delete edges"));
        return;
      }
    }
    get().commitLegacyHistory({ nodes, edges: nextEdges });
  },

  removeEdge: (id) => {
    get().removeEdges([id]);
  },

  updateEdgeLabel: (id, label) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "update edge label", set))) return;
    const edge = edges.find((e) => e.id === id);
    if (!edge) return;
    const trimmed = label.trim();
    const nextLabel: string | undefined = trimmed === "" ? undefined : trimmed;
    if (edge.data?.label === nextLabel) return;
    if (documentSession) {
      try {
        const committed = commitFlowchartSemanticOperations(
          documentSession,
          [{ kind: "update-edge", id, label: nextLabel }],
          `Update edge ${id}`,
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "update edge label"));
          return;
        }
        const projected = projectSessionModel(committed.value, nodes);
        set({
          documentSession: committed.value,
          codeSource: committed.value.source,
          ...projected,
          isDirty: committed.value.dirty,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "update edge label"));
        return;
      }
    }
    get().commitLegacyHistory({
      nodes,
      edges: edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, label: nextLabel } } : e,
      ),
    });
  },

  setEdgeStyle: (id, style) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "set edge style", set))) return;
    const edge = edges.find((e) => e.id === id);
    if (!edge) return;
    if (edge.data?.style === style) return;
    if (documentSession) {
      try {
        const committed = commitFlowchartSemanticOperations(
          documentSession,
          [{ kind: "update-edge", id, style }],
          `Style edge ${id}`,
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "set edge style"));
          return;
        }
        const projected = projectSessionModel(committed.value, nodes);
        set({
          documentSession: committed.value,
          codeSource: committed.value.source,
          ...projected,
          isDirty: committed.value.dirty,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "set edge style"));
        return;
      }
    }
    get().commitLegacyHistory({
      nodes,
      edges: edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, style } } : e,
      ),
    });
  },

  setEdgeRouteMode: (id, routeMode) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) {
      const edge = edges.find(candidate => candidate.id === id)
      if (!edge) return
      const nextRouteMode = routeMode === "manual" ? "orthogonal" : routeMode
      const { waypoints, ...dataWithoutWaypoints } = edge.data ?? {}
      const data = {
        ...dataWithoutWaypoints,
        routeMode: nextRouteMode,
        ...(nextRouteMode === "orthogonal" && waypoints ? { waypoints } : {}),
      }
      if (JSON.stringify(edge.data) === JSON.stringify(data)) return
      get().commitLegacyHistory({
        nodes,
        edges: edges.map(candidate => candidate.id === id ? { ...candidate, data } : candidate),
      })
      return
    }
    const result = executeFlowchartEdgeRoutingCommand(
      documentSession,
      { kind: "set-mode", id, routeMode },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "set edge route mode"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      ...projected,
      isDirty: result.value.dirty,
    });
  },

  setAllEdgeRouteModes: (routeMode) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || edges.length === 0) return;
    if (!documentSession) {
      const nextEdges = edges.map((edge) => {
        const { waypoints, ...dataWithoutWaypoints } = edge.data ?? {};
        const data = {
          ...dataWithoutWaypoints,
          routeMode,
          ...(routeMode === "orthogonal" && waypoints ? { waypoints } : {}),
        };
        return legacyRouteDataEqual(edge.data, data) ? edge : { ...edge, data };
      });
      if (nextEdges.every((edge, index) => edge === edges[index])) return;
      get().commitLegacyHistory({ nodes, edges: nextEdges });
      return;
    }
    try {
      const result = executeFlowchartEdgeRoutingCommand(
        documentSession,
        { kind: "set-all-modes", routeMode },
        { createId: () => crypto.randomUUID() },
      );
      if (!result.ok) {
        if (result.code !== "invalid-operation") set(reportCommandFailure(result, "set all edge route modes"));
        return;
      }
      const projected = projectSessionModel(result.value, nodes);
      set({
        documentSession: result.value,
        codeSource: result.value.source,
        ...projected,
        isDirty: result.value.dirty,
        announcement: `Routed all edges as ${routeMode}`,
      });
    } catch (error) {
      set(reportCommandFailure(unexpectedCommandFailure(error), "set all edge route modes"));
    }
  },

  setNodeConnectionPolicy: (policy) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked || !documentSession) return;
    if (!reportFlowchartSessionGuard(documentSession, "set node connection policy", set)) return;
    const result = executeFlowchartNodeConnectionCommand(
      documentSession,
      { kind: "set-policy", policy },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "set node connection policy"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      ...projected,
      isDirty: result.value.dirty,
      announcement: "Connection policy updated",
    });
  },

  setEdgeAttachmentSide: (id, endpoint, side) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked || !documentSession) return;
    if (!reportFlowchartSessionGuard(documentSession, "set edge attachment side", set)) return;
    const result = executeFlowchartNodeConnectionCommand(
      documentSession,
      { kind: "set-edge-side", edgeId: id, endpoint, side },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "set edge attachment side"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      ...projected,
      isDirty: result.value.dirty,
      announcement: "Edge attachment updated",
    });
  },

  retargetEdgeEndpoint: (id, endpoint, nodeId, side) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked) return;
    const edge = edges.find(candidate => candidate.id === id);
    if (!edge || edge[endpoint] === nodeId) return;
    if (documentSession) {
      if (!reportFlowchartSessionGuard(documentSession, 'retarget edge endpoint', set)) return;
      const result = executeFlowchartNodeConnectionCommand(
        documentSession,
        { kind: 'retarget-edge', edgeId: id, endpoint, nodeId, side },
        { createId: () => crypto.randomUUID() },
      );
      if (!result.ok) {
        set(reportCommandFailure(result, 'retarget edge endpoint'));
        return;
      }
      const projected = projectSessionModel(result.value, nodes);
      set({ documentSession: result.value, codeSource: result.value.source, ...projected, isDirty: result.value.dirty });
      return;
    }
    get().commitLegacyHistory({
      nodes,
      edges: edges.map(candidate => candidate.id !== id ? candidate : {
        ...candidate,
        [endpoint]: nodeId,
        data: {
          ...candidate.data,
          ...(endpoint === 'source' ? { sourceSide: side } : { targetSide: side }),
        },
      }),
    });
  },

  addEdgeWaypoint: (id, point) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) return;
    const result = executeFlowchartEdgeRoutingCommand(
      documentSession,
      { kind: "add-waypoint", id, point },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "add edge waypoint"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      ...projected,
      isDirty: result.value.dirty,
      announcement: "Waypoint added",
    });
  },

  moveEdgeWaypoint: (id, index, point) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) return;
    const result = executeFlowchartEdgeRoutingCommand(
      documentSession,
      { kind: "move-waypoint", id, index, point },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "move edge waypoint"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      ...projected,
      isDirty: result.value.dirty,
    });
  },

  removeEdgeWaypoint: (id, index) => {
    const { nodes, documentSession, isLocked } = get();
    if (isLocked) return;
    if (!documentSession) return;
    const result = executeFlowchartEdgeRoutingCommand(
      documentSession,
      { kind: "remove-waypoint", id, index },
      { createId: () => crypto.randomUUID() },
    );
    if (!result.ok) {
      set(reportCommandFailure(result, "remove edge waypoint"));
      return;
    }
    const projected = projectSessionModel(result.value, nodes);
    set({
      documentSession: result.value,
      ...projected,
      isDirty: result.value.dirty,
      announcement: "Waypoint removed",
    });
  },

  addEdge: ({ source, target, sourceSide }, routeMode = 'curved') => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "add edge", set))) return;
    if (source === target) {
      set(reportCommandFailure({ ok: false, code: "invalid-operation", message: "A node cannot connect to itself." }, "add self-loop edge"));
      return;
    }
    if (edges.some((e) => e.source === source && e.target === target)) {
      set(reportCommandFailure({ ok: false, code: "invalid-operation", message: "An edge between these nodes already exists." }, "add duplicate edge"));
      return;
    }
    // Floating edges: no sourceHandle/targetHandle stored — the edge attaches to
    // the optimal node border point, computed in FlowEdge from live positions.
    const attachment = documentSession && flowchartNodeConnections(documentSession.layout).mode === 'side'
      ? connectionAttachmentSides(nodes, source, target, sourceSide)
      : undefined;
    const newEdge: Edge<FlowEdgeData> = {
      id: `e-${source}-${target}`,
      source,
      target,
      data: { style: "arrow", routeMode, ...attachment },
      type: "default",
    };
    if (documentSession) {
      try {
        const edgeId = nextFlowchartEdgeId(documentSession, source, target)
        const committed = commitFlowchartSemanticOperations(
          documentSession,
          [{ kind: "add-edge", id: edgeId, source, target, style: "arrow" }],
          `Add edge ${edgeId}`,
          undefined,
          withFlowchartRoute(documentSession.layout, edgeId, routeMode, attachment),
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "add edge"));
          return;
        }
        const projected = projectSessionModel(committed.value, nodes);
        set({
          documentSession: committed.value,
          codeSource: committed.value.source,
          ...projected,
          isDirty: committed.value.dirty,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "add edge"));
        return;
      }
    }
    get().commitLegacyHistory({ nodes, edges: [...edges, newEdge] });
  },

  updateNodeLabel: (id, label) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "rename node", set))) return;
    const target = nodes.find((n) => n.id === id);
    if (!target || target.data.label === label) return; // not found or same label — no-op
    if (documentSession) {
      try {
        const committed = executeFlowchartCommand(
          documentSession,
          {
            operations: [{ kind: "rename-node", id, label }],
            description: `Rename node ${id}`,
            selection: [`node:${id}`],
          },
          { createId: () => crypto.randomUUID() },
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "rename node"));
          return;
        }
        const projected = projectSessionModel(committed.value, nodes);
        set({
          documentSession: committed.value,
          codeSource: committed.value.source,
          ...projected,
          isDirty: committed.value.dirty,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "rename node"));
        return;
      }
    }
    get().commitLegacyHistory({
      nodes: nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, label } } : n,
      ),
      edges,
    });
  },

  moveNodes: (updates, beforePositions) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "move nodes", set))) return;
    const beforeNodes = beforePositions
      ? nodes.map((node) =>
          beforePositions[node.id]
            ? { ...node, position: beforePositions[node.id] }
            : node,
        )
      : nodes;
    const requestedPositions = new Map(
      updates.map((update) => [update.id, update.position]),
    );
    const movingIds = new Set(requestedPositions.keys());
    let anyMoved = false;
    const nextNodes = nodes.map((n) => {
      const upd = updates.find((u) => u.id === n.id);
      if (!upd) return n;
      const position = collisionFreeNodePosition(
        n,
        upd.position,
        nodes,
        movingIds,
      );
      // React Flow updates controlled node positions during a drag before onNodeDragStop.
      // Compare against canonical session geometry so the final stop still records one
      // layout transaction instead of being mistaken for a no-op.
      const canonical = documentSession?.layout.elements[`node:${n.id}`];
      const unchanged = canonical
        ? position.x === canonical.x && position.y === canonical.y
        : position.x === n.position.x && position.y === n.position.y;
      if (unchanged) return n;
      anyMoved = true;
      return { ...n, position };
    });
    if (!anyMoved) return; // all positions unchanged — no-op
    if (documentSession) {
      const result = commitFlowchartGeometryTransaction(
        documentSession,
        beforeNodes,
        nextNodes,
        "Move nodes",
        { createId: () => crypto.randomUUID() },
      );
      if (!result.ok) {
        set(reportCommandFailure(result, "move nodes"));
        return;
      }
      const projected = projectSessionModel(result.value, nextNodes);
      set({
        documentSession: result.value,
        ...projected,
        isDirty: result.value.dirty,
      });
      return;
    }
    get().commitLegacyHistory({ nodes: nextNodes, edges });
  },

  applyAutoLayout: () => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || nodes.length === 0) return;
    if (!documentSession) {
      get().commitLegacyHistory({
        nodes: planFlowchartAutoLayout(nodes, edges),
        edges,
      });
      return;
    }
    if (!reportFlowchartSessionGuard(documentSession, "auto-layout", set)) return;
    const result = executeFlowchartAutoLayoutCommand(documentSession, nodes, edges, { createId: () => crypto.randomUUID() });
    if (!result.ok) {
      set(reportCommandFailure(result, "auto-layout"));
      return;
    }
    set({
      documentSession: result.value.session,
      nodes: result.value.nodes,
      edges,
      isDirty: result.value.session.dirty,
      announcement: "Auto-layout applied; routes reset",
    });
  },

  resizeNode: (id, dimensions, position) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "resize node", set))) return;
    const target = nodes.find((n) => n.id === id);
    if (!target) return; // id not found — no-op
    const sameSize =
      target.width === dimensions.width && target.height === dimensions.height;
    const samePos =
      !position ||
      (target.position.x === position.x && target.position.y === position.y);
    if (sameSize && samePos) return; // no-op guard — no history entry
    const nextNode = {
      ...target,
      width: dimensions.width,
      height: dimensions.height,
      ...(position ? { position } : {}),
    };
    const nextNodes = nodes.map((n) => (n.id === id ? nextNode : n));
    if (documentSession) {
      const result = commitFlowchartGeometryTransaction(
        documentSession,
        nodes,
        nextNodes,
        `Resize node ${id}`,
        { createId: () => crypto.randomUUID() },
      );
      if (!result.ok) {
        set(reportCommandFailure(result, "resize node"));
        return;
      }
      const projected = projectSessionModel(result.value, nextNodes);
      set({
        documentSession: result.value,
        ...projected,
        isDirty: result.value.dirty,
      });
      return;
    }
    get().commitLegacyHistory({ nodes: nextNodes, edges });
  },

  assignToSubgraph: (nodeId, subgraphId, relativePosition) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "assign to subgraph", set))) return;
    if (documentSession) {
      const result = executeFlowchartSubgraphMembershipCommand(
        documentSession,
        nodes,
        { kind: "assign", nodeId, subgraphId, position: relativePosition },
        { createId: () => crypto.randomUUID() },
      );
      if (!result.ok) {
        set(reportCommandFailure(result, "assign to subgraph"));
        return;
      }
      const projected = projectSessionModel(
        result.value.session,
        result.value.nodes,
      );
      set({
        documentSession: result.value.session,
        codeSource: result.value.session.source,
        ...projected,
        isDirty: result.value.session.dirty,
        announcement: result.value.announcement,
      });
      return;
    }
    const plan = planFlowchartSubgraphMembership(nodes, {
      kind: "assign",
      nodeId,
      subgraphId,
      position: relativePosition,
    });
    if (!plan) return;
    get().commitLegacyHistory({ nodes: plan.nodes, edges });
  },

  removeFromSubgraph: (nodeId, absolutePosition) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "remove from subgraph", set))) return;
    if (documentSession) {
      const result = executeFlowchartSubgraphMembershipCommand(
        documentSession,
        nodes,
        { kind: "remove", nodeId, position: absolutePosition },
        { createId: () => crypto.randomUUID() },
      );
      if (!result.ok) {
        set(reportCommandFailure(result, "remove from subgraph"));
        return;
      }
      const projected = projectSessionModel(
        result.value.session,
        result.value.nodes,
      );
      set({
        documentSession: result.value.session,
        codeSource: result.value.session.source,
        ...projected,
        isDirty: result.value.session.dirty,
        announcement: result.value.announcement,
      });
      return;
    }
    const plan = planFlowchartSubgraphMembership(nodes, {
      kind: "remove",
      nodeId,
      position: absolutePosition,
    });
    if (!plan) return;
    get().commitLegacyHistory({ nodes: plan.nodes, edges });
  },

  spawnConnectedNode: (sourceId, position, routeMode = 'curved', sourceSide) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "add connected node", set))) return;
    const sourceNode = nodes.find((n) => n.id === sourceId);
    if (!sourceNode) return;
    const newId = allocateCompactIdentifier("node", occupiedFlowchartElementIds(nodes, documentSession));
    const newNode: Node<FlowNodeData> = {
      id: newId,
      position,
      type: "flowNode",
      data: { label: "Node", shape: sourceNode.data.shape },
    };
    const attachment = documentSession && flowchartNodeConnections(documentSession.layout).mode === 'side'
      ? connectionAttachmentSides([...nodes, newNode], sourceId, newId, sourceSide)
      : undefined;
    const newEdge: Edge<FlowEdgeData> = {
      id: `e-${sourceId}-${newId}`,
      source: sourceId,
      target: newId,
      data: { style: "arrow", routeMode, ...attachment },
      type: "default",
    };
    if (documentSession) {
      try {
        const edgeId = nextFlowchartEdgeId(documentSession, sourceId, newId)
        const committed = commitFlowchartSemanticOperations(
          documentSession,
          [
            {
              kind: "add-node",
              id: newId,
              label: "Node",
              shape:
                sourceNode.data.shape === "subgraph"
                  ? "rectangle"
                  : sourceNode.data.shape,
            },
            {
              kind: "add-edge",
              id: edgeId,
              source: sourceId,
              target: newId,
              style: "arrow",
            },
          ],
          `Add connected node ${newId}`,
          [`node:${newId}`],
          withFlowchartRoute(documentSession.layout, edgeId, routeMode, attachment),
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "add connected node"));
          return;
        }
        const projected = projectSessionModel(committed.value, [
          ...nodes,
          newNode,
        ]);
        set({
          documentSession: committed.value,
          codeSource: committed.value.source,
          ...projected,
          isDirty: committed.value.dirty,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "add connected node"));
        return;
      }
    }
    get().commitLegacyHistory({
      nodes: [...nodes, newNode],
      edges: [...edges, newEdge],
    });
  },

  updateNodeShape: (id, shape) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked) return;
    const node = nodes.find((n) => n.id === id);
    if (!node || node.data.shape === shape) return;
    if (documentSession && !reportFlowchartSessionGuard(documentSession, "change node shape", set)) return;
    if (
      shape !== "subgraph" &&
      documentSession
    ) {
      try {
        const committed = commitFlowchartSemanticOperations(
          documentSession,
          [{ kind: "update-node-shape", id, shape }],
          `Change shape ${id}`,
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "change node shape"));
          return;
        }
        const semanticProjection = projectSessionModel(committed.value, nodes);
        const shapedNodes = semanticProjection.nodes.map((candidate) =>
          candidate.id === id ? normalizeShapeGeometry(candidate, shape) : candidate,
        );
        const changedNode = shapedNodes.find((candidate) => candidate.id === id);
        const geometryChanged = changedNode && (
          changedNode.width !== node.width ||
          changedNode.height !== node.height ||
          changedNode.position.x !== node.position.x ||
          changedNode.position.y !== node.position.y
        );
        if (!geometryChanged) {
          set({
            documentSession: committed.value,
            codeSource: committed.value.source,
            ...semanticProjection,
            isDirty: committed.value.dirty,
          });
          return;
        }
        const geometry = commitFlowchartGeometryTransaction(
          committed.value,
          semanticProjection.nodes,
          shapedNodes,
          `Normalize ${shape} geometry`,
          { createId: () => crypto.randomUUID() },
        );
        if (!geometry.ok) {
          set(reportCommandFailure(geometry, "normalize node geometry"));
          return;
        }
        const projected = projectSessionModel(geometry.value, shapedNodes);
        set({
          documentSession: geometry.value,
          codeSource: geometry.value.source,
          ...projected,
          isDirty: geometry.value.dirty,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "change node shape"));
        return;
      }
    }
    get().commitLegacyHistory({
      nodes: nodes.map((n) => n.id === id ? normalizeShapeGeometry(n, shape) : n),
      edges,
    });
  },

  duplicateNode: (id) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "duplicate node", set))) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    if (documentSession) {
      const newId = allocateCompactIdentifier("node", occupiedFlowchartElementIds(nodes, documentSession));
      const newNode = {
        ...node,
        id: newId,
        position: {
          x: node.position.x + GRID_SNAP,
          y: node.position.y + GRID_SNAP,
        },
        selected: true,
      };
      const nextNodes = nodes.map((n) =>
        n.id === id ? { ...n, selected: false } : n,
      );
      try {
        const committed = commitFlowchartSemanticOperations(
          documentSession,
          [{
            kind: "add-node",
            id: newId,
            label: node.data.label,
            shape: node.data.shape === "subgraph" ? "rectangle" : node.data.shape,
            mermaidShape: node.data.mermaidShape,
          }],
          `Duplicate node ${id}`,
          [`node:${newId}`],
          duplicateNodeLayout(documentSession.layout, [newNode], [node.id]),
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "duplicate node"));
          return;
        }
        const colorOperation = duplicateNodeColorOperation(newNode);
        const styled = colorOperation
          ? commitFlowchartSemanticOperations(
              committed.value,
              [colorOperation],
              `Style duplicated node ${newId}`,
              [`node:${newId}`],
            )
          : committed;
        if (!styled.ok) {
          set(reportCommandFailure(styled, "duplicate node"));
          return;
        }
        const projected = projectSessionModel(styled.value, [...nextNodes, newNode]);
        set({
          documentSession: styled.value,
          codeSource: styled.value.source,
          ...projected,
          isDirty: styled.value.dirty,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "duplicate node"));
        return;
      }
    }
    const newNode = {
      ...node,
      id: crypto.randomUUID(),
      position: {
        x: node.position.x + GRID_SNAP,
        y: node.position.y + GRID_SNAP,
      },
      selected: true,
    };
    const nextNodes = nodes.map((n) =>
      n.id === id ? { ...n, selected: false } : n,
    );
    get().commitLegacyHistory({ nodes: [...nextNodes, newNode], edges });
  },

  duplicateNodes: (ids) => {
    const current = get();
    if (current.isLocked || (current.documentSession && !reportFlowchartSessionGuard(current.documentSession, "duplicate nodes", set))) return;
    const eligible = current.nodes.filter(
      (n) => ids.includes(n.id) && !n.data.isSubgraph && !n.parentId,
    );
    if (eligible.length === 0) return;
    const offset = GRID_SNAP * 2;
    const occupied = current.documentSession
      ? occupiedFlowchartElementIds(current.nodes, current.documentSession)
      : undefined;
    const copies = eligible.map((n) => {
      const id = occupied
        ? allocateCompactIdentifier("node", occupied)
        : crypto.randomUUID();
      occupied?.add(id);
      return {
        ...n,
        id,
        position: { x: n.position.x + offset, y: n.position.y + offset },
        selected: true,
      };
    });
    const eligibleIds = new Set(eligible.map((e) => e.id));
    const updated = current.nodes.map((n) =>
      eligibleIds.has(n.id) ? { ...n, selected: false } : n,
    );
    if (current.documentSession) {
      try {
        const committed = commitFlowchartSemanticOperations(
          current.documentSession,
          copies.map((node) => ({
            kind: "add-node" as const,
            id: node.id,
            label: node.data.label,
            shape: node.data.shape,
            mermaidShape: node.data.mermaidShape,
          })),
          `Duplicate ${eligible.length} node${eligible.length > 1 ? "s" : ""}`,
          copies.map((node) => `node:${node.id}`),
          duplicateNodeLayout(current.documentSession.layout, copies, eligible.map((node) => node.id)),
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "duplicate nodes"));
          return;
        }
        const colorOperations = copies
          .map(duplicateNodeColorOperation)
          .filter((operation): operation is FlowchartSemanticOperation => operation !== null);
        const styled = colorOperations.length > 0
          ? commitFlowchartSemanticOperations(
              committed.value,
              colorOperations,
              `Style duplicated ${eligible.length} node${eligible.length > 1 ? "s" : ""}`,
              copies.map((node) => `node:${node.id}`),
            )
          : committed;
        if (!styled.ok) {
          set(reportCommandFailure(styled, "duplicate nodes"));
          return;
        }
        const projected = projectSessionModel(styled.value, [...updated, ...copies]);
        set({
          documentSession: styled.value,
          codeSource: styled.value.source,
          ...projected,
          isDirty: styled.value.dirty,
          announcement: `Duplicated ${eligible.length} node${eligible.length > 1 ? "s" : ""}`,
        });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "duplicate nodes"));
        return;
      }
    }
    get().commitLegacyHistory({
      nodes: [...updated, ...copies],
      edges: current.edges,
    });
    set({
      announcement: `Duplicated ${eligible.length} node${eligible.length > 1 ? "s" : ""}`,
    });
  },

  toggleNodeLock: (id) => {
    const { nodes, edges, isLocked } = get();
    if (isLocked) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const wasLocked = node.draggable === false;
    get().commitLegacyHistory({
      nodes: nodes.map((n) =>
        n.id === id ? { ...n, draggable: wasLocked } : n,
      ),
      edges,
    });
  },

  updateNodeColors: (id, colors) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "update node colors", set))) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    const d = node.data;
    const nextColors = {
      fillColor: 'fillColor' in colors ? colors.fillColor : d.fillColor,
      strokeColor: 'strokeColor' in colors ? colors.strokeColor : d.strokeColor,
      strokeWidth: 'strokeWidth' in colors ? colors.strokeWidth : d.strokeWidth,
      textColor: 'textColor' in colors ? colors.textColor : d.textColor,
    };
    if (
      d.fillColor === nextColors.fillColor &&
      d.strokeColor === nextColors.strokeColor &&
      d.strokeWidth === nextColors.strokeWidth &&
      d.textColor === nextColors.textColor
    )
      return;
    if (documentSession) {
      try {
        const committed = executeFlowchartCommand(
          documentSession,
          { operations: [{ kind: "update-node-colors", id, ...nextColors }], description: `Update node ${id} colors`, selection: [`node:${id}`] },
          { createId: () => crypto.randomUUID() },
        );
        if (!committed.ok) {
          set(reportCommandFailure(committed, "update node colors"));
          return;
        }
        const projected = projectSessionModel(committed.value, nodes);
        set({ documentSession: committed.value, codeSource: committed.value.source, ...projected, isDirty: committed.value.dirty });
        return;
      } catch (error) {
        set(reportCommandFailure(unexpectedCommandFailure(error), "update node colors"));
        return;
      }
    }
    get().commitLegacyHistory({
      nodes: nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...nextColors } } : n,
      ),
      edges,
    });
  },

  updateNodeStrokeWidth: (id, strokeWidth) => {
    get().updateNodeColors(id, { strokeWidth });
  },

  updateNodeTextAlignment: (id, alignment) => {
    const { nodes, edges, documentSession, isLocked } = get();
    if (isLocked || (documentSession && !reportFlowchartSessionGuard(documentSession, "update node text alignment", set))) return;
    const node = nodes.find((candidate) => candidate.id === id);
    if (!node) return;
    const next = {
      textHorizontalAlign: alignment.horizontal ?? node.data.textHorizontalAlign,
      textVerticalAlign: alignment.vertical ?? node.data.textVerticalAlign,
    };
    if (node.data.textHorizontalAlign === next.textHorizontalAlign && node.data.textVerticalAlign === next.textVerticalAlign) return;
    if (documentSession) {
      const result = executeFlowchartTextAlignmentCommand(documentSession, id, alignment, { createId: () => crypto.randomUUID() });
      if (!result.ok) {
        set(reportCommandFailure(result, "update node text alignment"));
        return;
      }
      const projected = projectSessionModel(result.value, nodes);
      set({ documentSession: result.value, codeSource: result.value.source, ...projected, isDirty: result.value.dirty });
      return;
    }
    get().commitLegacyHistory({
      nodes: nodes.map((candidate) => candidate.id === id ? { ...candidate, data: { ...candidate.data, ...next } } : candidate),
      edges,
    });
  },

  toggleNodeHandDrawn: (id) => {
    const { nodes, edges, isLocked } = get();
    if (isLocked) return;
    const node = nodes.find((n) => n.id === id);
    if (!node) return;
    get().commitLegacyHistory({
      nodes: nodes.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, isHandDrawn: !n.data.isHandDrawn } }
          : n,
      ),
      edges,
    });
  },

  importFromCode: (result) => {
    const { nodes, edges } = get();
    const currentNodeMap = new Map(nodes.map((n) => [n.id, n]));

    const mergedNodes = result.nodes.map((parsedNode) => {
      const current = currentNodeMap.get(parsedNode.id);
      if (!current) return parsedNode;
      return {
        ...parsedNode,
        position: current.position,
        selected: current.selected,
        data: {
          ...parsedNode.data,
          fillColor: current.data.fillColor,
          strokeColor: current.data.strokeColor,
          strokeWidth: parsedNode.data.strokeWidth ?? current.data.strokeWidth,
          textColor: current.data.textColor,
          textHorizontalAlign: current.data.textHorizontalAlign,
          textVerticalAlign: current.data.textVerticalAlign,
          isHandDrawn: current.data.isHandDrawn,
        },
      };
    });

    const isNoOp =
      mergedNodes.length === nodes.length &&
      result.edges.length === edges.length &&
      mergedNodes.every((n) => {
        const c = currentNodeMap.get(n.id);
        return (
          c !== undefined &&
          c.data.label === n.data.label &&
          c.data.shape === n.data.shape &&
          c.parentId === n.parentId
        );
      }) &&
      result.edges.every((e) =>
        edges.some(
          (o) =>
            o.source === e.source &&
            o.target === e.target &&
            o.data?.label === e.data?.label &&
            o.data?.style === e.data?.style,
        ),
      );

    if (isNoOp) return;

    const session = get().documentSession;
    if (session) {
      const documentSession = materializeFlowchartSourceImportLayout(
        session,
        mergedNodes,
      );
      const projected = projectSessionModel(documentSession, mergedNodes);
      set({ documentSession, ...projected, isDirty: documentSession.dirty });
      return;
    }
    get().commitLegacyHistory({ nodes: mergedNodes, edges: result.edges });
  },

});
