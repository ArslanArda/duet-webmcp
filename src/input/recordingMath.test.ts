import { describe, expect, it } from "vitest";
import { detectChordSymbol, normalizeDetectedChord, tickForElapsed } from "./recordingMath";

describe("recording math", () => {
  it("wraps positions while loop-recording", () => {
    expect(tickForElapsed(100, 1920, 3840, false)).toBe(2020);
    expect(tickForElapsed(3840 + 100, 1920, 3840, true)).toBe(2020);
    expect(tickForElapsed(3840 + 100, 1920, 3840, false)).toBe(1920 + 3940);
  });
  it("names chords the way people type them", () => {
    expect(normalizeDetectedChord("CM7")).toBe("Cmaj7");
    expect(normalizeDetectedChord("CM")).toBe("C");
    expect(normalizeDetectedChord("F#m7")).toBe("F#m7");
    expect(detectChordSymbol([60, 63, 67, 70])).toBe("Cm7");
    expect(detectChordSymbol([60, 64, 67])).toBe("C");
    expect(detectChordSymbol([60])).toBeNull();
  });
});
