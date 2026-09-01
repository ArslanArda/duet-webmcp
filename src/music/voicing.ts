import { Chord, Note as TonalNote } from "@tonaljs/tonal";
import { BEATS_PER_BAR, TICKS_PER_BEAT, TICKS_PER_BAR } from "../types";

export interface NoteDraft {
  trackId: "melody" | "bass" | "chords";
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
}

export function chordPitches(symbol: string, low = 48, high = 72): number[] {
  const chord = Chord.get(symbol);
  if (chord.empty || !chord.notes.length) return [];
  const pitches = chord.notes.map((pitchClass) => {
    for (let octave = 2; octave <= 6; octave += 1) {
      const midi = TonalNote.midi(`${pitchClass}${octave}`);
      if (midi !== null && midi >= low) return Math.min(midi, high);
    }
    return low;
  });
  return [...new Set(pitches)].sort((a, b) => a - b);
}

export function voiceChord(symbol: string, bar: number, style: "block" | "arpeggio" = "block"): NoteDraft[] {
  const pitches = chordPitches(symbol);
  if (!pitches.length) return [];
  if (style === "block") {
    return pitches.slice(0, 4).map((pitch) => ({
      trackId: "chords",
      pitch,
      startTick: bar * TICKS_PER_BAR,
      durationTicks: TICKS_PER_BAR - 30,
      velocity: 72,
    }));
  }
  return Array.from({ length: BEATS_PER_BAR * 2 }, (_, index) => ({
    trackId: "chords" as const,
    pitch: pitches[index % Math.min(pitches.length, 4)],
    startTick: bar * TICKS_PER_BAR + index * (TICKS_PER_BEAT / 2),
    durationTicks: TICKS_PER_BEAT / 2 - 20,
    velocity: index % 2 === 0 ? 76 : 64,
  }));
}
