import { describe, expect, it } from "vitest";
import { createDemoProject } from "../store/seed";
import { TICKS_PER_BAR } from "../types";
import { answerPhrase } from "./answer";
import { isValidChord } from "./theory";
import { MOODS, suggestProgressions } from "./progressions";

describe("call and response", () => {
  it("answers in the target bars with the same number of notes and rhythm", () => {
    const project = createDemoProject();
    const answer = answerPhrase(project, 0, 2, 2, 2, "echo");
    const phrase = project.notes.filter((n) => n.trackId === "melody" && n.startTick < 2 * TICKS_PER_BAR);
    expect(answer).toHaveLength(phrase.length);
    expect(answer.every((n) => n.startTick >= 2 * TICKS_PER_BAR && n.startTick < 4 * TICKS_PER_BAR)).toBe(
      true,
    );
    expect(answer.map((n) => n.startTick - 2 * TICKS_PER_BAR)).toEqual(phrase.map((n) => n.startTick));
  });
  it("is deterministic and differs by style", () => {
    const project = createDemoProject();
    expect(answerPhrase(project, 0, 2, 2, 2, "invert")).toEqual(answerPhrase(project, 0, 2, 2, 2, "invert"));
    expect(answerPhrase(project, 0, 2, 2, 2, "sequence")).not.toEqual(
      answerPhrase(project, 0, 2, 2, 2, "echo"),
    );
  });
  it("returns nothing without a phrase", () => {
    expect(answerPhrase({ ...createDemoProject(), notes: [] }, 0, 2, 2, 2)).toEqual([]);
  });
});

describe("mood progressions", () => {
  it("realizes valid chords in any key for every mood", () => {
    ["C", "F#", "Eb", "B"].forEach((key) =>
      MOODS.forEach((mood) => {
        const options = suggestProgressions(key, mood, 4, "en");
        expect(options.length).toBeGreaterThanOrEqual(2);
        options.forEach((option) => {
          expect(option.chords).toHaveLength(4);
          expect(option.chords.every(isValidChord)).toBe(true);
          expect(option.why.length).toBeGreaterThan(10);
        });
      }),
    );
  });
});
