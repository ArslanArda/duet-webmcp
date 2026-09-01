import { describe, expect, it } from "vitest";
import {
  buildChordSymbol,
  CHORD_QUALITIES,
  describeChord,
  prettySymbol,
  suggestedChords,
  tempoWord,
} from "./chordCatalog";
import { isValidChord } from "./theory";

describe("chord catalog", () => {
  it("describes common symbols in plain language", () => {
    expect(describeChord("Fm7", "tr")).toMatchObject({ root: "F", label: "Minör 7" });
    expect(describeChord("Cmaj7", "en")).toMatchObject({ root: "C", label: "Major 7" });
    expect(describeChord("G7", "en")?.mood).toContain("bluesy");
    expect(describeChord("Hmaj9", "en")).toBeNull();
  });
  it("builds only symbols tonal can parse", () => {
    ["C", "C#", "Eb", "F#", "Bb"].forEach((root) =>
      CHORD_QUALITIES.forEach((quality) =>
        expect(isValidChord(buildChordSymbol(root, quality.id))).toBe(true),
      ),
    );
    expect(buildChordSymbol("C#", "min7")).toBe("C#m7");
  });
  it("suggests diatonic chords for the project key", () => {
    const minor = suggestedChords("C", "minor");
    expect(minor.triads).toEqual(expect.arrayContaining(["Cm", "Fm", "Gm", "Ab"]));
    expect(minor.sevenths.every(isValidChord)).toBe(true);
    expect(suggestedChords("D", "dorian").sevenths).toContain("Dm7");
  });
  it("formats symbols and tempo words", () => {
    expect(prettySymbol("Ebmaj7")).toBe("E♭maj7");
    expect(prettySymbol("F#m7b5")).toBe("F♯m7b5");
    expect(tempoWord(100, "en")).toBe("Medium");
    expect(tempoWord(160, "tr")).toBe("Çok hızlı");
  });
});
