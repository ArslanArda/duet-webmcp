import { beforeEach, describe, expect, it } from "vitest";
import { createDemoProject } from "../store/seed";
import { projectStore } from "../store/projectStore";
import { webMCPTools } from "./tools";

const tool = (name: string) => webMCPTools.find((item) => item.name === name)!;

describe("drafts and awareness", () => {
  beforeEach(() => {
    projectStore.setState({
      project: createDemoProject(),
      drafts: [],
      activeDraftId: null,
      changeLog: [],
      past: [],
      future: [],
    });
  });

  it("keeps musical edits as drafts until the person accepts", async () => {
    const before = projectStore.getState().project.chords.map((slot) => slot.symbol);
    const result = (await tool("set_chord_progression").execute({
      startBar: 0,
      chords: ["Dm7", "G7", "Cmaj7", "Cmaj7"],
    })) as {
      ok: boolean;
      draft?: boolean;
      draftId: string;
    };
    expect(result).toMatchObject({ ok: true, draft: true });
    expect(projectStore.getState().project.chords.map((slot) => slot.symbol)).toEqual(before);
    expect(projectStore.getState().drafts).toHaveLength(1);
    const accepted = (await tool("resolve_draft").execute({ action: "accept", draftId: result.draftId })) as {
      ok: boolean;
    };
    expect(accepted.ok).toBe(true);
    expect(projectStore.getState().project.chords[0].symbol).toBe("Dm7");
    expect(projectStore.getState().drafts).toHaveLength(0);
    expect(projectStore.getState().changeLog[0].toolName).toBe("set_chord_progression");
  });

  it("writes immediately when asked to apply", async () => {
    await tool("set_chord_progression").execute({ startBar: 0, chords: ["Am"], mode: "apply" });
    expect(projectStore.getState().project.chords[0].symbol).toBe("Am");
    expect(projectStore.getState().drafts).toHaveLength(0);
  });

  it("offers several options at once", async () => {
    const result = (await tool("propose_variations").execute({
      kind: "chords",
      startBar: 0,
      endBar: 4,
      count: 3,
    })) as {
      ok: boolean;
      drafts: Array<{ id: string; label: string }>;
    };
    expect(result.ok).toBe(true);
    expect(result.drafts).toHaveLength(3);
    expect(projectStore.getState().drafts).toHaveLength(3);
    await tool("resolve_draft").execute({ action: "discard_all" });
    expect(projectStore.getState().drafts).toHaveLength(0);
  });

  it("answers a phrase in the following bars", async () => {
    const result = (await tool("answer_phrase").execute({
      sourceStartBar: 0,
      sourceEndBar: 2,
      style: "echo",
    })) as {
      ok: boolean;
      draft: boolean;
      affectedBars: { startBar: number; endBar: number };
    };
    expect(result).toMatchObject({ ok: true, draft: true, affectedBars: { startBar: 2, endBar: 4 } });
  });

  it("rejects writes made against a stale page", async () => {
    const version = projectStore.getState().stateVersion;
    projectStore.getState().setSelection({ trackId: "melody", startBar: 0, endBar: 1 });
    const result = (await tool("set_tempo").execute({ bpm: 90, expectedStateVersion: version })) as {
      ok: boolean;
      error: { code: string };
    };
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe("STALE_STATE");
  });

  it("suggests valid progressions for a mood and reports recent activity", async () => {
    const suggestions = (await tool("suggest_progressions").execute({ mood: "epic", bars: 4 })) as {
      ok: boolean;
      options: Array<{ chords: string[]; why: string }>;
    };
    expect(suggestions.ok).toBe(true);
    expect(suggestions.options.length).toBeGreaterThanOrEqual(2);
    projectStore
      .getState()
      .addHumanNote({ trackId: "bass", pitch: 40, startTick: 0, durationTicks: 480, velocity: 80 });
    const activity = (await tool("get_recent_activity").execute({})) as {
      ok: boolean;
      humanEvents: Array<{ type: string }>;
    };
    expect(activity.ok).toBe(true);
    expect(activity.humanEvents[0].type).toBe("notes_added");
  });

  it("labels sections and changes sounds as undoable changes", async () => {
    await tool("set_sections").execute({
      sections: [
        { startBar: 0, name: "Intro" },
        { startBar: 4, name: "Chorus" },
      ],
    });
    expect(projectStore.getState().project.sections).toEqual([
      { startBar: 0, name: "Intro" },
      { startBar: 4, name: "Chorus" },
    ]);
    await tool("set_instrument").execute({ trackId: "melody", instrument: "strings" });
    expect(projectStore.getState().project.instruments?.melody).toBe("strings");
    projectStore.getState().undoChange(projectStore.getState().changeLog[0].id);
    expect(projectStore.getState().project.instruments?.melody).toBeUndefined();
  });
});
