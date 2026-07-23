import type { StateCreator } from "zustand";
import type { FlowforgeState, SelectionSlice } from "../types";
import { withFlowchartSelection } from "../selectionSync";

export const createSelectionSlice: StateCreator<
  FlowforgeState,
  [],
  [],
  SelectionSlice
> = (set, get) => ({
  deselectAll: () => {
    const { nodes, edges, documentSession } = get();
    const nextNodes = nodes.map((node) =>
      node.selected ? { ...node, selected: false } : node,
    );
    const nextEdges = edges.map((edge) =>
      edge.selected ? { ...edge, selected: false } : edge,
    );
    const nextSession = withFlowchartSelection(
      documentSession,
      nextNodes,
      nextEdges,
    );
    if (
      !nodes.some((node) => node.selected) &&
      !edges.some((edge) => edge.selected) &&
      nextSession === documentSession
    ) {
      return;
    }
    set({
      nodes: nextNodes,
      edges: nextEdges,
      documentSession: nextSession,
    });
  },

  selectAll: () => {
    const { nodes, edges, documentSession } = get();
    const nextNodes = nodes.map((node) => ({ ...node, selected: true }));
    set({
      nodes: nextNodes,
      documentSession: withFlowchartSelection(
        documentSession,
        nextNodes,
        edges,
      ),
    });
  },

  selectOnly: (id) => {
    const { nodes, edges, documentSession } = get();
    const nextNodes = nodes.map((node) => ({
      ...node,
      selected: node.id === id,
    }));
    const nextEdges = edges.map((edge) => ({
      ...edge,
      selected: edge.id === id,
    }));
    set({
      nodes: nextNodes,
      edges: nextEdges,
      documentSession: withFlowchartSelection(
        documentSession,
        nextNodes,
        nextEdges,
      ),
    });
  },
});
