import type { StateCreator } from "zustand";
import type { FlowforgeState, DocumentSlice } from "../types";
import type { DocumentSession } from "../../lib/documentSession";
import {
  acceptExternalRevision,
  acknowledgeSave,
  commitSourceOperationTransaction,
  resolveConflict,
} from "../../lib/documentSession";
import {
  initializeAdapterProjection,
  validateAdapterSource,
} from "../../lib/adapterPlatform";
import { readEmbeddedLayoutV2 } from "../../lib/embeddedLayout";
import { projectFlowchartSession } from "../../features/flowchart";
import type { ClassAdapterModel } from "../../features/class-diagram";

function classDiagramModel(session: DocumentSession): ClassAdapterModel | null {
  return session.family === "class" &&
    !session.projection.diagnostics.some(
      (diagnostic) => diagnostic.code === "code-preview-fallback",
    )
    ? (session.projection.model as ClassAdapterModel)
    : null;
}
function hasFlowchartCanvasProjection(session: DocumentSession): boolean {
  return (
    session.family === "flowchart" &&
    !session.projection.diagnostics.some(
      (diagnostic) => diagnostic.code === "code-preview-fallback",
    )
  );
}
const projectSessionModel = projectFlowchartSession;
export const createDocumentSlice: StateCreator<
  FlowforgeState,
  [],
  [],
  DocumentSlice
> = (set, get) => ({
  documentSession: null,
  codeSource: "",
  classDiagram: null,
  initializeDocumentSession: (documentSession) =>
    set({
      documentSession,
      codeSource: documentSession.source,
      classDiagram: classDiagramModel(documentSession),
    }),
  setInspectorVisible: (visible) => {
    const current = get();
    const session = current.documentSession;
    if (!session || session.layout.inspectorVisible === visible) return;
    const layout = { ...session.layout, inspectorVisible: visible };
    const nextSession = {
      ...session,
      layout,
      dirty: session.source !== session.baseSource
        || JSON.stringify(layout) !== JSON.stringify(session.baseLayout),
    };
    set({ documentSession: nextSession, isDirty: nextSession.dirty });
  },
  applyCodeSource: (source) => {
    const current = get();
    const session = current.documentSession;
    if (current.isLocked && session && hasFlowchartCanvasProjection(session)) {
      set({ announcement: "Canvas is locked; unlock it to edit source." });
      return;
    }
    set({ codeSource: source });
    if (!session || session.conflict || source === session.source) return;
    if (
      (session.family === "flowchart" || session.family === "class") &&
      !validateAdapterSource(session.family, source)
    ) {
      set({
        announcement:
          "Canvas remains on the last valid diagram. Fix the Mermaid code to update it.",
      });
      return;
    }
    // A full .mmd paste can carry its own FLOWFORGE LAYOUT block. Apply that
    // layout in the same transaction as the source so renamed node IDs do not
    // inherit stale geometry from the diagram that was open before the paste.
    const embedded = readEmbeddedLayoutV2(source, session.family);
    const committed = commitSourceOperationTransaction(
      session,
      {
        id: crypto.randomUUID(),
        description: "Edit Mermaid source",
        operations: [
          {
            kind: "replace",
            range: { start: 0, end: session.source.length },
            text: source,
            expectedText: session.source,
            expectedRevision: session.workingRevision,
          },
        ],
        ...(embedded.layout ? { layout: embedded.layout } : {}),
      },
      (candidate, revision) =>
        initializeAdapterProjection(session.family, candidate, revision),
    );
    if (!committed.success) return;
    if (hasFlowchartCanvasProjection(committed.session)) {
      const projected = projectSessionModel(committed.session, current.nodes);
      set({
        documentSession: committed.session,
        codeSource: committed.session.source,
        classDiagram: null,
        ...projected,
        isDirty: committed.session.dirty,
      });
      return;
    }
    const classDiagram = classDiagramModel(committed.session);
    if (classDiagram) {
      set({
        documentSession: committed.session,
        codeSource: committed.session.source,
        classDiagram,
        isDirty: committed.session.dirty,
      });
      return;
    }
    const fallback = committed.session.projection.diagnostics.find(
      (diagnostic) => diagnostic.code === "code-preview-fallback",
    );
    set({
      documentSession: committed.session,
      codeSource: committed.session.source,
      nodes: current.nodes,
      edges: current.edges,
      isDirty: committed.session.dirty,
      announcement: fallback?.message ?? "Canvas source updated",
    });
  },
  prepareDocumentSave: (content, layout) => {
    const session = get().documentSession;
    if (!session || session.conflict) return null;
    const operations =
      content === session.source
        ? []
        : [
            {
              kind: "replace" as const,
              range: { start: 0, end: session.source.length },
              text: content,
              expectedText: session.source,
              expectedRevision: session.workingRevision,
            },
          ];
    const committed = commitSourceOperationTransaction(
      session,
      {
        id: crypto.randomUUID(),
        description: "Persist source and layout",
        operations,
        layout,
      },
      (candidate, revision) =>
        initializeAdapterProjection(session.family, candidate, revision),
    );
    if (!committed.success) return null;
    set({
      documentSession: committed.session,
      codeSource: committed.session.source,
      classDiagram: classDiagramModel(committed.session),
      isDirty: committed.session.dirty,
    });
    return committed.session;
  },
  acceptExternalDocument: (projection, layout, hostRevision, eventId) => {
    const current = get();
    if (!current.documentSession) return;
    const session = acceptExternalRevision(
      current.documentSession,
      hostRevision,
      projection,
      layout,
      eventId,
    );
    if (session === current.documentSession) return;
    if (session.conflict) {
      set({
        documentSession: session,
        isDirty: true,
        announcement: "External changes require resolution",
      });
      return;
    }
    const projected =
      session.family === "flowchart"
        ? projectSessionModel(session, current.nodes)
        : { nodes: [], edges: [] };
    set({
      documentSession: session,
      codeSource: session.source,
      classDiagram: classDiagramModel(session),
      ...projected,
      isDirty: false,
      announcement: "External changes adopted",
    });
  },
  acknowledgeDocumentSave: (acknowledgement) => {
    const current = get();
    if (!current.documentSession) return;
    const session = acknowledgeSave(current.documentSession, acknowledgement);
    if (session === current.documentSession) return;
    set({ documentSession: session, isDirty: session.dirty });
  },
  resolveDocumentConflict: (kind) => {
    const current = get();
    if (!current.documentSession?.conflict) return false;
    const result = resolveConflict(
      current.documentSession,
      kind === "adopt-external"
        ? { kind, transactionId: crypto.randomUUID() }
        : {
            kind,
            transactionId: crypto.randomUUID(),
            validate: (source) =>
              validateAdapterSource(current.documentSession!.family, source),
          },
      (candidate, revision) =>
        initializeAdapterProjection(
          current.documentSession!.family,
          candidate,
          revision,
        ),
    );
    if (!result.success) return false;
    const projected =
      result.session.family === "flowchart"
        ? projectSessionModel(result.session, current.nodes)
        : { nodes: [], edges: [] };
    set({
      documentSession: result.session,
      codeSource: result.session.source,
      classDiagram: classDiagramModel(result.session),
      ...projected,
      isDirty: result.session.dirty,
      announcement:
        kind === "adopt-external"
          ? "External changes adopted"
          : "Local changes kept",
    });
    return true;
  },

  isDirty: false,
  clearDirty: () => set((s) => ({ ...s, isDirty: false })),
});
