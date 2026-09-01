import { describe, expect, it } from "vitest";
import { webMCPTools } from "../webmcp/tools";
import { projectStore } from "./projectStore";

describe("agent change history", () => {
  it("creates and cleanly undoes a serializable tempo patch", async () => {
    const before = projectStore.getState().project.tempo;
    const tool = webMCPTools.find((item) => item.name === "set_tempo")!;
    const result = (await tool.execute({ bpm: before + 7 })) as { ok: boolean; changeId: string };
    expect(result.ok).toBe(true);
    expect(projectStore.getState().project.tempo).toBe(before + 7);
    const change = projectStore.getState().changeLog[0];
    expect(JSON.parse(JSON.stringify(change))).toMatchObject({
      id: result.changeId,
      inversePatch: { previousTempo: before },
    });
    projectStore.getState().undoChange(result.changeId);
    expect(projectStore.getState().project.tempo).toBe(before);
  });

  it("clears only the selected bars on the selected track", () => {
    const store = projectStore.getState();
    const removedId = store.addHumanNote({
      trackId: "melody",
      pitch: 60,
      startTick: 0,
      durationTicks: 240,
      velocity: 80,
    });
    const keptId = store.addHumanNote({
      trackId: "bass",
      pitch: 36,
      startTick: 0,
      durationTicks: 240,
      velocity: 80,
    });
    projectStore.getState().deleteInRange({ trackId: "melody", startBar: 0, endBar: 1 });
    const ids = new Set(projectStore.getState().project.notes.map((note) => note.id));
    expect(ids.has(removedId)).toBe(false);
    expect(ids.has(keptId)).toBe(true);
  });

  it("undoes and redoes human edits as whole steps", () => {
    const store = projectStore.getState();
    const before = store.project.notes.length;
    store.addHumanNote({ trackId: "melody", pitch: 64, startTick: 480, durationTicks: 240, velocity: 80 });
    const id = projectStore.getState().project.notes.at(-1)!.id;
    projectStore.getState().updateHumanNote(id, { pitch: 65 });
    projectStore.getState().updateHumanNote(id, { pitch: 67 });
    expect(projectStore.getState().project.notes.length).toBe(before + 1);
    expect(projectStore.getState().undo()).toBe(true);
    expect(projectStore.getState().project.notes.length).toBe(before);
    expect(projectStore.getState().redo()).toBe(true);
    expect(projectStore.getState().project.notes.find((note) => note.id === id)?.pitch).toBe(67);
  });

  it("keeps the AI change log consistent through global undo", async () => {
    const tool = webMCPTools.find((item) => item.name === "set_tempo")!;
    const tempo = projectStore.getState().project.tempo;
    await tool.execute({ bpm: tempo + 3 });
    const logLength = projectStore.getState().changeLog.length;
    projectStore.getState().undo();
    expect(projectStore.getState().project.tempo).toBe(tempo);
    expect(projectStore.getState().changeLog.length).toBe(logLength - 1);
    projectStore.getState().redo();
    expect(projectStore.getState().project.tempo).toBe(tempo + 3);
    expect(projectStore.getState().changeLog.length).toBe(logLength);
  });

  it("keeps the selection when switching tracks", () => {
    const store = projectStore.getState();
    store.setSelection({ trackId: "melody", startBar: 2, endBar: 6 });
    store.setActiveTrack("bass");
    expect(projectStore.getState().selection).toEqual({ trackId: "bass", startBar: 2, endBar: 6 });
  });
});
