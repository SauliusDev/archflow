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
  recoverySnapshot: null,
  initializeDocumentSession: (documentSession) =>
    set({
      documentSession,
      codeSource: documentSession.source,
      classDiagram: classDiagramModel(documentSession),
      recoverySnapshot: hasFlowchartCanvasProjection(documentSession)
        ? { session: documentSession, nodes: [], edges: [] }
        : null,
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
        recoverySnapshot: { session: committed.session, nodes: projected.nodes, edges: projected.edges },
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
  restoreLastValidDiagram: () => {
    const { documentSession: session, recoverySnapshot } = get();
    if (!session) return;
    if (recoverySnapshot) {
      const projected = hasFlowchartCanvasProjection(recoverySnapshot.session)
        ? projectSessionModel(recoverySnapshot.session, get().nodes)
        : { nodes: recoverySnapshot.nodes, edges: recoverySnapshot.edges };
      set({
        documentSession: recoverySnapshot.session,
        codeSource: recoverySnapshot.session.source,
        classDiagram: classDiagramModel(recoverySnapshot.session),
        ...projected,
        isDirty: recoverySnapshot.session.dirty,
        announcement: "Restored the last valid diagram.",
      });
      return;
    }
    const fallback = session.projection.diagnostics.some(diagnostic => diagnostic.code === "code-preview-fallback");
    const transaction = session.history.past.at(-1);
    // A fallback projection intentionally has no concrete handles, so normal
    // undo cannot apply its inverse. Rebuild the preceding document directly
    // from the transaction's whole-source inverse instead.
    const inverse = transaction?.inverse.find(operation => operation.kind === "replace" && operation.range.start === 0);
    if (fallback && transaction && inverse?.kind === "replace") {
      const projection = initializeAdapterProjection(session.family, inverse.text, session.workingRevision + 1);
      if (!projection.diagnostics.some(diagnostic => diagnostic.code === "code-preview-fallback")) {
        const recovered = {
          ...session,
          workingRevision: session.workingRevision + 1,
          source: inverse.text,
          projection,
          layout: transaction.layoutBefore,
          selection: [...transaction.selectionBefore],
          dirty: inverse.text !== session.baseSource || JSON.stringify(transaction.layoutBefore) !== JSON.stringify(session.baseLayout),
          history: { past: session.history.past.slice(0, -1), future: [...session.history.future, transaction] },
        };
        const projected = hasFlowchartCanvasProjection(recovered)
          ? projectSessionModel(recovered, get().nodes)
          : { nodes: get().nodes, edges: get().edges };
        set({
          documentSession: recovered,
          codeSource: recovered.source,
          classDiagram: classDiagramModel(recovered),
          ...projected,
          isDirty: recovered.dirty,
          announcement: "Restored the last valid diagram.",
        });
        return;
      }
    }
    set({ codeSource: session.source, announcement: "Restored the last valid diagram." });
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
    // Persisting the embedded layout advances the working document, but is not
    // a user edit. Keeping its transaction in history made Ctrl+Z undo save
    // serialization before it could undo the preceding canvas action.
    const persisted = { ...committed.session, history: session.history };
    set({
      documentSession: persisted,
      codeSource: persisted.source,
      classDiagram: classDiagramModel(persisted),
      isDirty: persisted.dirty,
    });
    return persisted;
  },
  acceptExternalDocument: (projection, layout, hostRevision, eventId) => {
    const current = get();
    if (!current.documentSession) return;
    // VS Code can echo our own completed write through its document watcher
    // before SAVE_RESULT reaches the webview. The source is already identical,
    // so acknowledge its newer host revision instead of creating a false
    // conflict that disables undo.
    if (projection.concrete.source === current.documentSession.source) {
      const session = acknowledgeSave(current.documentSession, {
        eventId,
        sessionId: current.documentSession.sessionId,
        transactionId: eventId,
        workingRevision: current.documentSession.workingRevision,
        hostRevision,
      });
      if (session === current.documentSession) return;
      set({
        documentSession: session,
        codeSource: session.source,
        isDirty: session.dirty,
        announcement: "Local save acknowledged",
      });
      return;
    }
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
      ...(hasFlowchartCanvasProjection(session)
        ? { recoverySnapshot: { session, nodes: projected.nodes, edges: projected.edges } }
        : {}),
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
