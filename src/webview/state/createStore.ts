import { create, createStore } from "zustand";
import type { StateCreator } from "zustand";
import type { FlowforgeState } from "./types";
import { createDocumentSlice } from "./sharedSlices/documentSlice";
import { createHistorySlice } from "./sharedSlices/historySlice";
import { createSelectionSlice } from "./sharedSlices/selectionSlice";
import { createCanvasSlice } from "./sharedSlices/canvasSlice";
import { createWorkspaceUiSlice } from "./sharedSlices/workspaceUiSlice";
import { createFlowchartSlice } from "../features/flowchart/state/createFlowchartSlice";
import { createClassDiagramSlice } from "../features/class-diagram/state/createClassDiagramSlice";

const flowforgeStateCreator: StateCreator<FlowforgeState> = (...args) => ({
  ...createDocumentSlice(...args),
  ...createHistorySlice(...args),
  ...createSelectionSlice(...args),
  ...createCanvasSlice(...args),
  ...createWorkspaceUiSlice(...args),
  ...createFlowchartSlice(...args),
  ...createClassDiagramSlice(...args),
});
export const createFlowforgeStore = () =>
  createStore<FlowforgeState>()(flowforgeStateCreator);
export const useStore = create<FlowforgeState>()(flowforgeStateCreator);
