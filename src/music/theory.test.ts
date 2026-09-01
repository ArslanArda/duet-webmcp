import { describe, expect, it } from "vitest";
import {
  deterministicHumanize,
  isValidChord,
  noteNameToMidi,
  quantizeTick,
  remapPitchToMode,
  romanForChord,
} from "./theory";
import type { Note } from "../types";

describe("music theory", () => {
  it("parses standard notes and chords", () => {
    expect(noteNameToMidi("C4")).toBe(60);
    expect(noteNameToMidi("Bb3")).toBe(58);
    expect(isValidChord("F#m7b5")).toBe(true);
    expect(isValidChord("Hmaj9")).toBe(false);
  });
  it("maps modes while keeping the pitch nearby", () => {
    expect(remapPitchToMode(69, "C", "major", "minor")).toBe(68);
    expect(remapPitchToMode(65, "C", "minor", "dorian")).toBe(65);
  });
  it("calculates roman roots", () => {
    expect(romanForChord("Cm7", "C")?.toUpperCase()).toContain("I");
    expect(romanForChord("G7", "C")).toBe("V");
  });
  it("quantizes repeatably", () => {
    expect(quantizeTick(251, 16)).toBe(240);
    expect(quantizeTick(251, 8)).toBe(240);
  });
  it("humanizes deterministically", () => {
    const note: Note = {
      id: "fixed",
      trackId: "melody",
      pitch: 60,
      startTick: 480,
      durationTicks: 480,
      velocity: 80,
      source: "human",
    };
    expect(deterministicHumanize(note, 20)).toEqual(deterministicHumanize(note, 20));
  });
});
