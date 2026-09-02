import { describe, expect, it } from "vitest";
import { createDemoProject } from "../store/seed";
import { describeRange } from "./describe";

describe("plain-language diagnosis", () => {
  it("notices the empty bass track in the demo", () => {
    const result = describeRange(createDemoProject(), 0, 4, "en");
    expect(result.findings.map((f) => f.code)).toContain("NO_BASS");
    expect(result.findings.find((f) => f.code === "NO_BASS")?.action?.tool).toBe("propose_variations");
    expect(result.tracks.melody.count).toBeGreaterThan(0);
  });
  it("reports missing chords and static melodies", () => {
    const project = createDemoProject();
    const bare = { ...project, chords: [], notes: project.notes.filter((n) => n.trackId === "melody").map((n) => ({ ...n, pitch: 72 })) };
    const codes = describeRange(bare, 0, 8, "tr").findings.map((f) => f.code);
    expect(codes).toContain("NO_CHORDS");
    expect(codes).toContain("MELODY_STATIC");
  });
  it("says so when nothing is missing", () => {
    const project = createDemoProject();
    const withBass = {
      ...project,
      notes: [...project.notes, ...[0, 1, 2, 3].map((bar) => ({ id: `b${bar}`, trackId: "bass" as const, pitch: 36, startTick: bar * 1920, durationTicks: 960, velocity: 80, source: "human" as const }))],
    };
    const result = describeRange(withBass, 0, 4, "en");
    expect(result.findings.some((f) => f.severity === "suggestion")).toBe(false);
  });
});
