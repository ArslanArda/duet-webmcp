import { describe, expect, it } from "vitest";
import { webMCPTools } from "../webmcp/tools";
import { projectStore } from "./projectStore";

describe("agent change history", () => {
  it("creates and cleanly undoes a serializable tempo patch", async () => {
    const before = projectStore.getState().project.tempo;
    const tool = webMCPTools.find((item) => item.name === "set_tempo")!;
    const result = await tool.execute({ bpm: before + 7 }) as { ok: boolean; changeId: string };
    expect(result.ok).toBe(true);
    expect(projectStore.getState().project.tempo).toBe(before + 7);
    const change = projectStore.getState().changeLog[0];
    expect(JSON.parse(JSON.stringify(change))).toMatchObject({ id: result.changeId, inversePatch: { previousTempo: before } });
    projectStore.getState().undoChange(result.changeId);
    expect(projectStore.getState().project.tempo).toBe(before);
  });

  it("clears only the selected bars on the selected track", () => {
    const store = projectStore.getState();
    const removedId = store.addHumanNote({ trackId: "melody", pitch: 60, startTick: 0, durationTicks: 240, velocity: 80 });
    const keptId = store.addHumanNote({ trackId: "bass", pitch: 36, startTick: 0, durationTicks: 240, velocity: 80 });
    projectStore.getState().clearRange({ trackId: "melody", startBar: 0, endBar: 1 });
    const ids = new Set(projectStore.getState().project.notes.map((note) => note.id));
    expect(ids.has(removedId)).toBe(false);
    expect(ids.has(keptId)).toBe(true);
  });
});
