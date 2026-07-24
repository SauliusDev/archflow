import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Node } from "@xyflow/react";
import { createFlowforgeStore, useStore } from "./createStore";
import { createDocumentSession } from "../lib/documentSession";
import { flowchartCompatibilityAdapter } from "../features/flowchart";
import type { FlowNodeData } from "../features/flowchart";
import type { LayoutStateV2 } from "../../shared/diagram-contracts";

const layout: LayoutStateV2 = {
  version: 2,
  diagramFamily: "flowchart",
  viewport: { x: 0, y: 0, zoom: 1 },
  elements: {},
  edges: {},
  constraints: [],
  adapterMetadata: {},
};

const node = (id: string): Node<FlowNodeData> => ({
  id,
  type: "flowNode",
  position: { x: 120, y: 80 },
  data: { label: id, shape: "rectangle" },
});

const expectedActionSurface = [
  "initializeDocumentSession",
  "setInspectorVisible",
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
  "openCommandPalette",
  "addNode",
  "addLane",
  "moveNodes",
  "addEdge",
  "importFromCode",
  "applyClassOperation",
  "updateClassGeometry",
];

const canvasSliceSource = readFileSync(
  "src/webview/state/sharedSlices/canvasSlice.ts",
  "utf8",
);

describe("createFlowforgeStore", () => {
  it("creates isolated stores while the production hook exposes the same actions", () => {
    const first = createFlowforgeStore();
    const second = createFlowforgeStore();

    first.getState().setFilename("first.mmd");

    expect(second.getState().filename).toBe("untitled.mmd");
    expect(Object.keys(useStore.getState())).toEqual(
      expect.arrayContaining(expectedActionSurface),
    );
    expect(Object.keys(first.getState())).toEqual(
      expect.arrayContaining(expectedActionSurface),
    );
  });

  it("commits a semantic command as one atomic root-state update", () => {
    const store = createFlowforgeStore();
    const projection = flowchartCompatibilityAdapter.parse(
      "flowchart LR\n  A[Alpha]\n",
      1,
    );
    store
      .getState()
      .initializeDocumentSession(
        createDocumentSession("session", 1, projection, layout),
      );
    store.getState().importFromCode(projection.model);

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    store.getState().addNode(node("B"));
    unsubscribe();

    const state = store.getState();
    expect(notifications).toBe(1);
    expect(state.documentSession?.source).toContain("B[B]");
    expect(state.codeSource).toBe(state.documentSession?.source);
    expect(state.nodes.some((item) => item.id === "B" && item.selected)).toBe(
      true,
    );
    expect(state.isDirty).toBe(true);
    expect(state.documentSession?.history.past).toHaveLength(1);
  });

  it("materializes an empty flowchart when its first node is added", () => {
    const store = createFlowforgeStore();
    const projection = flowchartCompatibilityAdapter.parse("", 1);
    store
      .getState()
      .initializeDocumentSession(
        createDocumentSession("empty-session", 1, projection, layout),
      );

    store.getState().addNode(node("A"));

    const state = store.getState();
    expect(state.documentSession?.source).toBe("flowchart TD\n  A[A]");
    expect(state.codeSource).toBe(state.documentSession?.source);
    expect(state.nodes).toEqual([
      expect.objectContaining({ id: "A", selected: true }),
    ]);
    expect(state.documentSession?.history.past).toHaveLength(1);
  });

  it("keeps source edits dirty when the inspector visibility is restored", () => {
    const store = createFlowforgeStore();
    const projection = flowchartCompatibilityAdapter.parse(
      "flowchart LR\n  A[Alpha]\n",
      1,
    );
    store
      .getState()
      .initializeDocumentSession(
        createDocumentSession("session", 1, projection, layout),
      );

    store.getState().applyCodeSource("flowchart LR\n  A[Renamed]\n");
    expect(store.getState().isDirty).toBe(true);

    store.getState().setInspectorVisible(false);
    store.getState().setInspectorVisible(true);

    expect(store.getState().documentSession?.layout.inspectorVisible).toBe(true);
    expect(store.getState().documentSession?.dirty).toBe(true);
    expect(store.getState().isDirty).toBe(true);
  });

  it("keeps semantic selection in the document session with controlled-flow flags", () => {
    const store = createFlowforgeStore();
    const projection = flowchartCompatibilityAdapter.parse(
      "flowchart LR\n  A[Alpha]\n",
      1,
    );
    store
      .getState()
      .initializeDocumentSession(
        createDocumentSession("session", 1, projection, layout),
      );
    store.setState({
      nodes: [node("A")],
      edges: [{ id: "e-A-A", source: "A", target: "A" }],
    });

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    store.getState().selectAll();
    unsubscribe();

    const selected = store.getState();
    expect(notifications).toBe(1);
    expect(selected.nodes.every((item) => item.selected)).toBe(true);
    expect(selected.documentSession?.selection).toEqual(["node:A"]);

    store.getState().addNode(node("B"));
    store.getState().undo();

    expect(
      store.getState().nodes.filter((item) => item.selected).map((item) => item.id),
    ).toEqual(["A"]);
    expect(store.getState().documentSession?.selection).toEqual(["node:A"]);

    store.getState().deselectAll();

    const deselected = store.getState();
    expect(deselected.nodes.every((item) => !item.selected)).toBe(true);
    expect(deselected.documentSession?.selection).toEqual([]);
  });

  it("keeps controlled-flow selection syncing atomic without coupling canvas to the selection slice", () => {
    const store = createFlowforgeStore();
    const projection = flowchartCompatibilityAdapter.parse(
      "flowchart LR\n  A[Alpha]\n",
      1,
    );
    store
      .getState()
      .initializeDocumentSession(
        createDocumentSession("session", 1, projection, layout),
      );

    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });
    store.getState().applyFlowChanges([{ ...node("A"), selected: true }]);
    unsubscribe();

    expect(notifications).toBe(1);
    expect(store.getState().documentSession?.selection).toEqual(["node:A"]);
    expect(canvasSliceSource).not.toMatch(/from\s+["']\.\/selectionSlice["']/);
  });
});
