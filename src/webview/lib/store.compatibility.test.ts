import { describe, expect, it } from "vitest";
import {
  GRID_SNAP,
  MAX_HISTORY,
  commitFlowchartSemanticOperations,
  useShallow,
  useStore,
} from "./store";

describe("store compatibility facade", () => {
  it("retains the migration API", () => {
    const state = useStore.getState();
    expect(GRID_SNAP).toBe(24);
    expect(MAX_HISTORY).toBe(100);
    expect(typeof commitFlowchartSemanticOperations).toBe("function");
    expect(typeof useShallow).toBe("function");
    expect(Object.keys(state)).toEqual(
      expect.arrayContaining([
        "initializeDocumentSession",
        "applyCodeSource",
        "prepareDocumentSave",
        "undo",
        "redo",
        "deselectAll",
        "selectAll",
        "requestFitView",
        "applyFlowChanges",
        "applyEdgeFlowChanges",
        "setFilename",
        "setPendingConnect",
        "addNode",
        "addLane",
        "addEdge",
        "importFromCode",
        "applyClassOperation",
        "updateClassGeometry",
      ]),
    );
  });
});
