import type { StateCreator } from "zustand";
import type { FlowforgeState, HistorySlice } from "../types";
import type { CanvasSnapshot, FlowNodeData } from "../../features/flowchart";
import type { Node } from "@xyflow/react";
import { MAX_HISTORY } from "../types";
import {
  redoDocumentTransaction,
  undoDocumentTransaction,
} from "../../lib/documentSession";
import { initializeAdapterProjection } from "../../lib/adapterPlatform";
import { projectFlowchartSession } from "../../features/flowchart";
import type { ClassAdapterModel } from "../../features/class-diagram";
import type { DocumentSession } from "../../lib/documentSession";

export function withHistory(
  get: () => FlowforgeState,
  set: (fn: (state: FlowforgeState) => FlowforgeState) => void,
  next: CanvasSnapshot,
): void {
  const current = get();
  if (
    current.isLocked ||
    current.documentSession ||
    (next.nodes === current.nodes && next.edges === current.edges)
  )
    return;
  set((state) => ({
    ...state,
    nodes: next.nodes,
    edges: next.edges,
    isDirty: true,
    history: {
      past: [
        ...state.history.past.slice(-(MAX_HISTORY - 1)),
        { nodes: state.nodes, edges: state.edges },
      ],
      future: [],
    },
  }));
}
function hasProjection(session: DocumentSession): boolean {
  return (
    session.family === "flowchart" &&
    !session.projection.diagnostics.some(
      (diagnostic) => diagnostic.code === "code-preview-fallback",
    )
  );
}
function classDiagramModel(session: DocumentSession): ClassAdapterModel | null {
  return session.family === "class" &&
    !session.projection.diagnostics.some(
      (diagnostic) => diagnostic.code === "code-preview-fallback",
    )
    ? (session.projection.model as ClassAdapterModel)
    : null;
}
function reparse(session: DocumentSession, source: string, revision: number) {
  return initializeAdapterProjection(session.family, source, revision);
}
function projectSessionModel(
  session: DocumentSession,
  nodes: Node<FlowNodeData>[],
  includeSelection = true,
) {
  return projectFlowchartSession(session, nodes, includeSelection);
}
export const createHistorySlice: StateCreator<
  FlowforgeState,
  [],
  [],
  HistorySlice
> = (set, get) => ({
  history: { past: [], future: [] },
  commitLegacyHistory: (next) => withHistory(get, set, next),
  undo: () => {
    const { history, documentSession, nodes, edges, isLocked } = get();
    if (isLocked || documentSession?.conflict) return;
    if (documentSession?.history.past.length) {
      const result = undoDocumentTransaction(
        documentSession,
        `undo:${documentSession.workingRevision}:${crypto.randomUUID()}`,
        (candidate, revision) => reparse(documentSession, candidate, revision),
      );
      if (!result.success) return;
      const projected = hasProjection(result.session)
        ? projectSessionModel(result.session, nodes, false)
        : { nodes, edges };
      set({
        documentSession: result.session,
        codeSource: result.session.source,
        classDiagram: classDiagramModel(result.session),
        ...projected,
        isDirty: result.session.dirty,
        announcement:
          `Undo ${documentSession.history.past.at(-1)?.description ?? ""}`.trim(),
      });
      return;
    }
    if (history.past.length === 0) return;
    const prev = history.past[history.past.length - 1];
    set((state) => ({
      ...state,
      nodes: prev.nodes,
      edges: prev.edges,
      history: {
        past: state.history.past.slice(0, -1),
        future: [
          { nodes: state.nodes, edges: state.edges },
          ...state.history.future,
        ],
      },
      announcement: "Undo",
    }));
  },

  redo: () => {
    const { history, documentSession, nodes, edges, isLocked } = get();
    if (isLocked || documentSession?.conflict) return;
    if (documentSession?.history.future.length) {
      const result = redoDocumentTransaction(
        documentSession,
        `redo:${documentSession.workingRevision}:${crypto.randomUUID()}`,
        (candidate, revision) => reparse(documentSession, candidate, revision),
      );
      if (!result.success) return;
      const projected = hasProjection(result.session)
        ? projectSessionModel(result.session, nodes, false)
        : { nodes, edges };
      set({
        documentSession: result.session,
        codeSource: result.session.source,
        classDiagram: classDiagramModel(result.session),
        ...projected,
        isDirty: result.session.dirty,
        announcement:
          `Redo ${documentSession.history.future.at(-1)?.description ?? ""}`.trim(),
      });
      return;
    }
    if (history.future.length === 0) return;
    const next = history.future[0];
    set((state) => ({
      ...state,
      nodes: next.nodes,
      edges: next.edges,
      history: {
        past: [
          ...state.history.past,
          { nodes: state.nodes, edges: state.edges },
        ],
        future: state.history.future.slice(1),
      },
      announcement: "Redo",
    }));
  },
});
