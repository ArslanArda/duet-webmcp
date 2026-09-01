import { Note as TonalNote } from "@tonaljs/tonal";
import type { Note, Project } from "../types";
import { TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";
import { scalePitchClasses } from "./theory";
import type { NoteDraft } from "./voicing";
import { chordPitches } from "./voicing";

export type AnswerStyle = "echo" | "sequence" | "invert" | "contrast";

/**
 * Call and response, deterministically: take the person's phrase, keep its
 * rhythm, move it through the scale (down a third, up a step, mirrored or
 * reversed), pull strong beats onto the target bars' chord tones and land
 * the last note on something that sounds like an answer.
 */
export function answerPhrase(
  project: Project,
  sourceStartBar: number,
  sourceEndBar: number,
  targetStartBar: number,
  targetBars: number,
  style: AnswerStyle = "echo",
): NoteDraft[] {
  const sourceStart = sourceStartBar * TICKS_PER_BAR;
  const sourceEnd = sourceEndBar * TICKS_PER_BAR;
  const phrase = project.notes
    .filter(
      (note) => note.trackId === "melody" && note.startTick >= sourceStart && note.startTick < sourceEnd,
    )
    .sort((a, b) => a.startTick - b.startTick || a.pitch - b.pitch);
  if (!phrase.length) return [];

  const scale = scalePitchClasses(project.keyCenter, project.mode).map((name) => TonalNote.chroma(name) ?? 0);
  const degreeOf = (pitch: number) => {
    const chroma = pitch % 12;
    let best = 0;
    let bestDistance = 13;
    scale.forEach((candidate, index) => {
      const distance = Math.min(Math.abs(chroma - candidate), 12 - Math.abs(chroma - candidate));
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    return Math.floor(pitch / 12) * scale.length + best;
  };
  const pitchOf = (degree: number) => {
    const octave = Math.floor(degree / scale.length);
    const index = ((degree % scale.length) + scale.length) % scale.length;
    return octave * 12 + scale[index];
  };

  const degrees = phrase.map((note) => degreeOf(note.pitch));
  const first = degrees[0];
  const shifted = degrees.map((degree, index) => {
    if (style === "sequence") return degree + 1;
    if (style === "invert") return first - (degree - first);
    if (style === "contrast") return degrees[degrees.length - 1 - index];
    return degree - 2;
  });

  const targetStart = targetStartBar * TICKS_PER_BAR;
  const targetEnd = targetStart + targetBars * TICKS_PER_BAR;
  const sourceSpan = Math.max(TICKS_PER_BAR, sourceEnd - sourceStart);
  const lastIndex = phrase.length - 1;

  const drafts: NoteDraft[] = phrase
    .map((note: Note, index): NoteDraft | null => {
      const offset = note.startTick - sourceStart;
      const startTick =
        targetStart + (style === "contrast" ? sourceSpan - offset - note.durationTicks : offset);
      if (startTick < targetStart || startTick >= targetEnd) return null;
      let pitch = Math.max(36, Math.min(96, pitchOf(shifted[index])));
      const bar = Math.floor(startTick / TICKS_PER_BAR);
      const chord = project.chords.find((slot) => slot.bar === bar);
      const strongBeat = startTick % TICKS_PER_BEAT === 0;
      if (chord && (strongBeat || index === lastIndex)) {
        const tones = chordPitches(chord.symbol, pitch - 6, pitch + 6);
        if (tones.length) pitch = tones.sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch))[0];
      }
      const isLast = index === lastIndex;
      const durationTicks = isLast
        ? Math.max(note.durationTicks, Math.min(TICKS_PER_BEAT * 2, targetEnd - startTick))
        : Math.min(note.durationTicks, targetEnd - startTick);
      return {
        trackId: "melody" as const,
        pitch,
        startTick,
        durationTicks,
        velocity: Math.max(60, note.velocity - 6),
      };
    })
    .filter((draft): draft is NoteDraft => draft !== null);

  return drafts.sort((a, b) => a.startTick - b.startTick);
}
