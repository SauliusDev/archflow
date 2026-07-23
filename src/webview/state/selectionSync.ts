import type { Edge, Node } from "@xyflow/react";
import type { SemanticHandle } from "../../shared/diagram-contracts";
import type { FlowEdgeData, FlowNodeData } from "../features/flowchart";
import type { DocumentSession } from "../lib/documentSession";

export function selectedFlowchartHandles(
  nodes: readonly Node<FlowNodeData>[],
  edges: readonly Edge<FlowEdgeData>[],
): SemanticHandle[] {
  return [
    ...nodes
      .filter((node) => node.selected)
      .map((node) => `node:${node.id}` as SemanticHandle),
    ...edges
      .filter((edge) => edge.selected)
      .map((edge) => `edge:${edge.id}` as SemanticHandle),
  ];
}

export function withFlowchartSelection(
  session: DocumentSession | null,
  nodes: readonly Node<FlowNodeData>[],
  edges: readonly Edge<FlowEdgeData>[],
): DocumentSession | null {
  if (session?.family !== "flowchart") return session;

  const selection = selectedFlowchartHandles(nodes, edges);
  if (
    selection.length === session.selection.length &&
    selection.every((handle, index) => handle === session.selection[index])
  ) {
    return session;
  }

  return { ...session, selection };
}
