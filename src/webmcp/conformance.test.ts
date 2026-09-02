import { beforeEach, describe, expect, it } from "vitest";
import { createDemoProject } from "../store/seed";
import { projectStore } from "../store/projectStore";
import { instrumentTool } from "./activity";
import { webMCPTools } from "./tools";

/**
 * Contract checks against the WebMCP spec (webmachinelearning.github.io/webmcp)
 * and ChatGPT's site-tools guidance: valid names, closed object schemas,
 * JSON-serializable results, self-correcting errors, no throws on odd input.
 */
const ALLOWED_KEYWORDS = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "description",
]);

function walkSchema(schema: unknown, path: string, problems: string[]) {
  if (typeof schema !== "object" || schema === null) return;
  const node = schema as Record<string, unknown>;
  for (const key of Object.keys(node))
    if (!ALLOWED_KEYWORDS.has(key)) problems.push(`${path}: keyword ${key}`);
  if (node.type === "object") {
    if (node.additionalProperties !== false) problems.push(`${path}: object is not closed`);
    if (typeof node.properties !== "object") problems.push(`${path}: object without properties`);
    const props = (node.properties ?? {}) as Record<string, unknown>;
    for (const required of (node.required as string[]) ?? [])
      if (!(required in props)) problems.push(`${path}: required ${required} missing`);
    for (const [name, child] of Object.entries(props)) walkSchema(child, `${path}.${name}`, problems);
  }
  if (node.items) walkSchema(node.items, `${path}[]`, problems);
}

const tool = (name: string) => webMCPTools.find((item) => item.name === name)!;
const run = (name: string, args: unknown) =>
  instrumentTool(tool(name)).execute(args as Record<string, unknown>);
const roundTrip = (value: unknown) => JSON.parse(JSON.stringify(value));

describe("WebMCP contract", () => {
  it("every tool has a valid name, description and closed object schema", () => {
    for (const item of webMCPTools) {
      expect(item.name).toMatch(/^[A-Za-z0-9_.-]{1,128}$/);
      expect(item.description.trim().length).toBeGreaterThan(20);
      expect(item.description.length).toBeLessThanOrEqual(400);
      const problems: string[] = [];
      walkSchema(item.inputSchema, item.name, problems);
      expect(problems).toEqual([]);
      expect(() => JSON.stringify(item.inputSchema)).not.toThrow();
      expect(typeof item.execute).toBe("function");
    }
  });

  it("marks exactly the non-mutating tools read-only", () => {
    const readOnly = webMCPTools
      .filter((item) => item.annotations?.readOnlyHint)
      .map((item) => item.name)
      .sort();
    expect(readOnly).toEqual([
      "analyze_harmony",
      "get_project_state",
      "get_recent_activity",
      "get_selection",
      "suggest_progressions",
    ]);
  });

  it("read tools tolerate a missing or empty input object", async () => {
    for (const name of ["get_project_state", "get_selection", "analyze_harmony", "get_recent_activity"]) {
      const result = roundTrip(await run(name, undefined));
      expect(result).toHaveProperty("ok");
      expect(result).toHaveProperty("stateVersion");
    }
  });
});

describe("every tool answers a golden call with a JSON-serializable result", () => {
  beforeEach(() => {
    projectStore.setState({
      project: createDemoProject(),
      drafts: [],
      activeDraftId: null,
      changeLog: [],
      past: [],
      future: [],
      selection: null,
    });
  });

  const golden: Array<[string, Record<string, unknown>, (result: Record<string, unknown>) => void]> = [
    ["get_project_state", {}, (r) => expect(r).toMatchObject({ ok: true, barCount: 16 })],
    [
      "set_selection",
      { trackId: "melody", startBar: 0, endBar: 4 },
      (r) => expect(r).toMatchObject({ ok: true, selection: { trackId: "melody" } }),
    ],
    ["get_selection", {}, (r) => expect(r).toMatchObject({ ok: true, selection: null })],
    [
      "analyze_harmony",
      { startBar: 0, endBar: 4 },
      (r) => expect(r).toMatchObject({ ok: true, bestFitMode: expect.any(String) }),
    ],
    [
      "get_recent_activity",
      { limit: 5 },
      (r) => expect(r).toMatchObject({ ok: true, humanEvents: expect.any(Array) }),
    ],
    [
      "suggest_progressions",
      { mood: "jazzy", bars: 4 },
      (r) => expect((r.options as unknown[]).length).toBeGreaterThan(0),
    ],
    [
      "set_chord_progression",
      { startBar: 0, chords: ["Cm7", "Fm7"] },
      (r) => expect(r).toMatchObject({ ok: true, draft: true }),
    ],
    [
      "set_chord_progression",
      { startBar: 0, chords: ["Cm7"], mode: "apply" },
      (r) => expect(r).toMatchObject({ ok: true, changeId: expect.any(String) }),
    ],
    [
      "add_notes",
      { trackId: "bass", notes: [{ pitchName: "C2", startBeat: 0, durationBeats: 1 }], mode: "apply" },
      (r) => expect(r).toMatchObject({ ok: true, notesAdded: 1 }),
    ],
    [
      "generate_line",
      { role: "bass", startBar: 0, endBar: 4, style: "flowing", mode: "apply" },
      (r) => expect(r).toMatchObject({ ok: true }),
    ],
    [
      "propose_variations",
      { kind: "bass", startBar: 0, endBar: 4, count: 2 },
      (r) => expect((r.drafts as unknown[]).length).toBe(2),
    ],
    [
      "answer_phrase",
      { sourceStartBar: 0, sourceEndBar: 2 },
      (r) => expect(r).toMatchObject({ ok: true, draft: true }),
    ],
    ["resolve_draft", { action: "discard_all" }, (r) => expect(r).toMatchObject({ ok: true })],
    ["set_tempo", { bpm: 96 }, (r) => expect(r).toMatchObject({ ok: true })],
    [
      "set_sections",
      { sections: [{ startBar: 0, name: "Intro" }] },
      (r) => expect(r).toMatchObject({ ok: true }),
    ],
    [
      "set_instrument",
      { trackId: "melody", instrument: "pad" },
      (r) => expect(r).toMatchObject({ ok: true }),
    ],
    [
      "play",
      { startBar: 0, endBar: 2 },
      (r) => expect(r).toMatchObject({ ok: false, requiresUserAction: true }),
    ],
  ];
  for (const [name, args, check] of golden) {
    it(`${name} ${JSON.stringify(args)}`, async () => {
      const result = roundTrip(await run(name, args)) as Record<string, unknown>;
      check(result);
    });
  }

  it("transform_selection handles every operation", async () => {
    projectStore.getState().setSelection({ trackId: "melody", startBar: 0, endBar: 4 });
    for (const args of [
      { operation: "transpose", amount: 2 },
      { operation: "change_mode", targetMode: "dorian" },
      { operation: "quantize", amount: 8 },
      { operation: "humanize", amount: 10 },
    ]) {
      const result = roundTrip(await run("transform_selection", { ...args, mode: "apply" })) as Record<
        string,
        unknown
      >;
      expect(result).toMatchObject({ ok: true, notesAdded: 0 });
    }
  });
});

describe("errors are self-correcting instructions, never throws", () => {
  const bad: Array<[string, Record<string, unknown>, string]> = [
    ["set_selection", { trackId: "drums", startBar: 0, endBar: 1 }, "INVALID_TRACK"],
    ["set_selection", { trackId: "melody", startBar: 12, endBar: 20 }, "BAR_OUT_OF_RANGE"],
    ["set_chord_progression", { startBar: 0, chords: ["Hmaj9"] }, "INVALID_CHORD"],
    [
      "add_notes",
      { trackId: "melody", notes: [{ pitchName: "X9", startBeat: 0, durationBeats: 1 }] },
      "INVALID_NOTE",
    ],
    [
      "add_notes",
      { trackId: "melody", notes: [{ pitchName: "C4", startBeat: 63, durationBeats: 4 }] },
      "NOTE_OUT_OF_RANGE",
    ],
    ["transform_selection", { operation: "transpose", amount: 3 }, "NO_SELECTION"],
    ["generate_line", { role: "bass", startBar: 0, endBar: 4 }, "MISSING_CHORDS"],
    ["set_tempo", { bpm: "fast" }, "INVALID_TEMPO"],
    ["suggest_progressions", { mood: "angry" }, "INVALID_MOOD"],
    ["propose_variations", { kind: "pad", startBar: 0, endBar: 2 }, "MISSING_CHORDS"],
    ["answer_phrase", { sourceStartBar: 14, sourceEndBar: 16 }, "NO_ROOM"],
    ["resolve_draft", { action: "accept" }, "NO_DRAFT"],
    [
      "set_sections",
      {
        sections: [
          { startBar: 0, name: "A" },
          { startBar: 0, name: "B" },
        ],
      },
      "DUPLICATE_SECTION",
    ],
    ["set_instrument", { trackId: "melody", instrument: "kazoo" }, "INVALID_INSTRUMENT"],
    ["set_tempo", { bpm: 100, expectedStateVersion: -5 }, "STALE_STATE"],
  ];
  beforeEach(() => {
    projectStore.setState({
      project: { ...createDemoProject(), chords: [] },
      drafts: [],
      activeDraftId: null,
      selection: null,
    });
    projectStore.getState().setSelection(null);
  });
  for (const [name, args, code] of bad) {
    it(`${name} → ${code}`, async () => {
      const result = roundTrip(await run(name, args)) as {
        ok: boolean;
        error: { code: string; message: string; hint: string };
      };
      expect(result.ok).toBe(false);
      expect(result.error.code).toBe(code);
      expect(result.error.message.length).toBeGreaterThan(5);
      expect(result.error.hint.length).toBeGreaterThan(5);
    });
  }
});
