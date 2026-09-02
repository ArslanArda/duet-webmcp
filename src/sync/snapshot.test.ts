import { describe, expect, it } from "vitest";
import { projectStore } from "../store/projectStore";
import { isSnapshotShape, pickSyncSnapshot, serializeSnapshot } from "./snapshot";

describe("sync snapshot", () => {
  it("carries only collaborative state, never transient browser state", () => {
    const state = projectStore.getState();
    const snapshot = pickSyncSnapshot(state) as unknown as Record<string, unknown>;
    expect(Object.keys(snapshot).sort()).toEqual(["changeLog", "project", "selection"]);
    const json = serializeSnapshot(pickSyncSnapshot(state));
    for (const forbidden of [
      "isPlaying",
      "midiDevice",
      "isRecording",
      "editorMode",
      "onboarding",
      "drafts",
      "humanLog",
    ])
      expect(json.includes(`"${forbidden}"`)).toBe(false);
  });
  it("serializes stably and round-trips through the shape guard", () => {
    const snapshot = pickSyncSnapshot(projectStore.getState());
    const a = serializeSnapshot(snapshot);
    expect(serializeSnapshot(JSON.parse(a))).toBe(a);
    expect(isSnapshotShape(JSON.parse(a))).toBe(true);
    expect(isSnapshotShape({ project: { tempo: "x" } })).toBe(false);
    expect(isSnapshotShape(null)).toBe(false);
  });
});
