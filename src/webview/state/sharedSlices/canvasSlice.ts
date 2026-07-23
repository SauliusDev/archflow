import type { StateCreator } from "zustand";
import type { FlowforgeState, CanvasSlice } from "../types";
import { withFlowchartSelection } from "../selectionSync";

export const createCanvasSlice: StateCreator<
  FlowforgeState,
  [],
  [],
  CanvasSlice
> = (set, get) => ({
  nodes: [],
  edges: [],
  fitViewRequested: false,
  requestFitView: () => set({ fitViewRequested: true }),
  clearFitViewRequest: () => set({ fitViewRequested: false }),
  viewport: { x: 0, y: 0, zoom: 1 },
  viewportToRestore: null,
  setViewport: (viewport) => set({ viewport }),
  requestViewportRestore: (viewport) => set({ viewportToRestore: viewport }),
  clearViewportRestore: () => set({ viewportToRestore: null }),
  applyFlowChanges: (nodes) => {
    const { edges, documentSession } = get();
    set({
      nodes,
      documentSession: withFlowchartSelection(documentSession, nodes, edges),
    });
  },
  applyEdgeFlowChanges: (edges) => {
    const { nodes, documentSession } = get();
    set({
      edges,
      documentSession: withFlowchartSelection(documentSession, nodes, edges),
    });
  },
});
