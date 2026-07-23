import type { StateCreator } from "zustand";
import type { FlowforgeState, WorkspaceUiSlice } from "../types";
export const createWorkspaceUiSlice: StateCreator<
  FlowforgeState,
  [],
  [],
  WorkspaceUiSlice
> = (set) => ({
  filename: "untitled.mmd",
  setFilename: (filename) => set({ filename }),
  syncDirection: null,
  setSyncDirection: (dir) => set({ syncDirection: dir }),
  pendingConnect: null,
  setPendingConnect: (pending, sourceSide) =>
    set({ pendingConnect: typeof pending === 'string'
      ? { kind: 'new', sourceId: pending, ...(sourceSide ? { sourceSide } : {}) }
      : pending, pendingConnectTargetId: null }),
  pendingConnectTargetId: null,
  setPendingConnectTargetId: (nodeId) => set({ pendingConnectTargetId: nodeId }),
  minimapOpen: false,
  toggleMinimap: () => set((s) => ({ minimapOpen: !s.minimapOpen })),
  isLocked: false,
  toggleLock: () => set((s) => ({ isLocked: !s.isLocked })),
  commandPaletteOpen: false,
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  announcement: null,
  announce: (text) => set({ announcement: text }),
  clearAnnouncement: () => set({ announcement: null }),
  pendingAddNode: null,
  requestAddNode: (shape, mermaidShape) =>
    set({
      pendingAddNode: { shape, ...(mermaidShape ? { mermaidShape } : {}) },
    }),
  clearPendingAddNode: () => set({ pendingAddNode: null }),
  pendingZoomAction: null,
  dispatchZoomAction: (type) => set({ pendingZoomAction: type }),
  clearPendingZoomAction: () => set({ pendingZoomAction: null }),
});
