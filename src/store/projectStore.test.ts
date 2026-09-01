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
});
