import { Chord } from "@tonaljs/tonal";
import { midiToPitchName } from "../music/theory";
import { TICKS_PER_BEAT } from "../types";

export const msToTicks = (ms: number, tempo: number) => (ms / 60000) * tempo * TICKS_PER_BEAT;

/** Where a note pressed `elapsedTicks` after the range started lands, wrapping while loop-recording. */
export function tickForElapsed(
  elapsedTicks: number,
  rangeStartTick: number,
  rangeTicks: number,
  loop: boolean,
) {
  const clamped = Math.max(0, elapsedTicks);
  return rangeStartTick + (loop ? clamped % rangeTicks : clamped);
}

/** tonal spells detected chords like "CM7" or "CM"; show the symbols people type. */
export function normalizeDetectedChord(symbol: string) {
  return symbol
    .replace(/M7$/, "maj7")
    .replace(/M9$/, "maj9")
    .replace(/M6$/, "6")
    .replace(/^([A-G][#b]?)M$/, "$1")
    .replace(/^([A-G][#b]?)M(?=[^a-z])/, "$1");
}

/** Best chord name for pitches pressed together, or null when they do not form one. */
export function detectChordSymbol(pitches: number[]): string | null {
  const names = [...new Set(pitches)].sort((a, b) => a - b).map((pitch) => midiToPitchName(pitch));
  if (names.length < 2) return null;
  const detected = Chord.detect(names).find((item) => !item.includes("/")) ?? Chord.detect(names)[0];
  if (!detected) return null;
  const symbol = normalizeDetectedChord(detected.split("/")[0]);
  const chord = Chord.get(symbol);
  return chord.empty || !chord.tonic ? null : symbol;
}
