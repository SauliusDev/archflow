import type { StateCreator } from "zustand";
import type { FlowforgeState, ClassDiagramSlice } from "../../../state/types";
import {
  executeClassDiagramCommand,
  executeClassGeometryCommand,
  type ClassAdapterModel,
} from "..";
import type { DocumentSession } from "../../../lib/documentSession";
import { reportCommandFailure } from "../../../state/commandReporting";

function reportClassSessionGuard(
  session: DocumentSession,
  context: string,
  set: (partial: Pick<FlowforgeState, "announcement">) => void,
): boolean {
  if (session.family !== "class") {
    set(reportCommandFailure({ ok: false, code: "unsupported-family", message: "This command requires a class diagram document" }, context));
    return false;
  }
  if (session.conflict) {
    set(reportCommandFailure({ ok: false, code: "external-conflict", message: "Document has an unresolved external change" }, context));
    return false;
  }
  return true;
}

function model(session: DocumentSession): ClassAdapterModel | null {
  return session.family === "class" &&
    !session.projection.diagnostics.some(
      (diagnostic) => diagnostic.code === "code-preview-fallback",
    )
    ? (session.projection.model as ClassAdapterModel)
    : null;
}
export const createClassDiagramSlice: StateCreator<
  FlowforgeState,
  [],
  [],
  ClassDiagramSlice
> = (set, get) => ({
  applyClassOperation: (operation) => {
    const { documentSession } = get();
    if (!documentSession) return;
    if (!reportClassSessionGuard(documentSession, "class diagram operation", set)) return;
    const result = executeClassDiagramCommand(documentSession, operation, {
      createId: () => crypto.randomUUID(),
    });
    if (!result.ok) {
      set(reportCommandFailure(result, "class diagram operation"));
      return;
    }
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      classDiagram: model(result.value),
      isDirty: result.value.dirty,
    });
  },
  updateClassGeometry: (id, geometry) => {
    const { documentSession } = get();
    if (!documentSession) return;
    if (!reportClassSessionGuard(documentSession, "update class geometry", set)) return;
    const result = executeClassGeometryCommand(documentSession, id, geometry, {
      createId: () => crypto.randomUUID(),
    });
    if (!result.ok) {
      set(reportCommandFailure(result, "update class geometry"));
      return;
    }
    set({
      documentSession: result.value,
      codeSource: result.value.source,
      classDiagram: model(result.value),
      isDirty: result.value.dirty,
    });
  },
});
