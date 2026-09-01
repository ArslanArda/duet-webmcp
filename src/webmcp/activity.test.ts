import { describe, expect, it } from "vitest";
import { activityStore, describeActivity, instrumentTool } from "./activity";

const tool = (name: string, execute: WebMCPTool["execute"]): WebMCPTool => ({
  name,
  description: "",
  inputSchema: { type: "object" },
  execute,
});

describe("agent activity feed", () => {
  it("records successful calls with their affected bars and flashes writes", async () => {
    const wrapped = instrumentTool(
      tool("set_chord_progression", async () => ({
        ok: true,
        changeId: "c1",
        affectedBars: { startBar: 0, endBar: 2 },
      })),
    );
    await wrapped.execute({ startBar: 0, chords: ["Cm7", "Fm7"] });
    const [entry] = activityStore.getState().activities;
    expect(entry).toMatchObject({
      tool: "set_chord_progression",
      kind: "write",
      status: "ok",
      changeId: "c1",
    });
    expect(activityStore.getState().flash).toMatchObject({ startBar: 0, endBar: 2 });
    expect(describeActivity(entry, "en")).toBe("Set 2 chords in bars 1–2");
    expect(describeActivity(entry, "tr")).toBe("2 akor koydu (1–2. ölçüler)");
  });

  it("shows rejected calls so self-correction is visible", async () => {
    const wrapped = instrumentTool(
      tool("add_notes", () => ({
        ok: false,
        error: { code: "INVALID_NOTE", message: "'H4' is not valid.", hint: "Use C4.", retryable: true },
      })),
    );
    await wrapped.execute({ trackId: "melody", notes: [{ pitchName: "H4" }] });
    const [entry] = activityStore.getState().activities;
    expect(entry).toMatchObject({ status: "error", errorHint: "Use C4." });
    expect(describeActivity(entry, "en")).toContain("rejected");
  });

  it("marks reads as running while they execute", async () => {
    let resolve: (value: unknown) => void = () => {};
    const wrapped = instrumentTool(tool("get_project_state", () => new Promise((r) => (resolve = r))));
    const pending = wrapped.execute({});
    expect(activityStore.getState().activities[0]).toMatchObject({ kind: "read", status: "running" });
    expect(describeActivity(activityStore.getState().activities[0], "en")).toContain("Reading");
    resolve({ ok: true });
    await pending;
    expect(activityStore.getState().activities[0].status).toBe("ok");
  });
});
