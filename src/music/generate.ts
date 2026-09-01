import { Chord, Note as TonalNote } from "@tonaljs/tonal";
import type { Project } from "../types";
import { TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";
import type { NoteDraft } from "./voicing";
import { chordPitches } from "./voicing";

export type LineRole = "bass" | "counter_melody" | "pad";
export type LineStyle = "simple" | "flowing" | "syncopated";

function rootMidi(symbol: string, octave: number): number | null {
  const tonic = Chord.get(symbol).tonic;
  return tonic ? TonalNote.midi(`${tonic}${octave}`) : null;
}

export function generateLine(
  project: Project,
  role: LineRole,
  startBar: number,
  endBar: number,
  style: LineStyle = "simple",
): NoteDraft[] {
  const result: NoteDraft[] = [];
  for (let bar = startBar; bar < endBar; bar += 1) {
    const slot = project.chords.find((chord) => chord.bar === bar);
    if (!slot) continue;
    if (role === "bass") {
      const root = rootMidi(slot.symbol, 2);
      if (root === null) continue;
      const chordTones = chordPitches(slot.symbol, 36, 55);
      const fifth = chordTones.find((pitch) => pitch > root + 4) ?? Math.min(55, root + 7);
      const beats = style === "simple" ? [0, 2] : style === "flowing" ? [0, 1, 2, 3] : [0, 1.5, 2.5, 3.5];
      beats.forEach((beat, index) =>
        result.push({
          trackId: "bass",
          pitch: index % 2 === 0 ? root : fifth,
          startTick: bar * TICKS_PER_BAR + beat * TICKS_PER_BEAT,
          durationTicks: style === "simple" ? TICKS_PER_BEAT * 1.75 : TICKS_PER_BEAT * 0.8,
          velocity: index === 0 ? 90 : 76,
        }),
      );
    } else if (role === "counter_melody") {
      const tones = chordPitches(slot.symbol, 60, 81);
      if (!tones.length) continue;
      const melody = project.notes.filter(
        (note) => note.trackId === "melody" && Math.floor(note.startTick / TICKS_PER_BAR) === bar,
      );
      const melodyAverage = melody.length
        ? melody.reduce((sum, note) => sum + note.pitch, 0) / melody.length
        : 69;
      const ordered = [...tones].sort(
        (a, b) => Math.abs(a - (84 - melodyAverage)) - Math.abs(b - (84 - melodyAverage)),
      );
      const beats = style === "syncopated" ? [0.5, 1.5, 2.75] : [0, 2];
      beats.forEach((beat, index) =>
        result.push({
          trackId: "melody",
          pitch: ordered[index % ordered.length],
          startTick: bar * TICKS_PER_BAR + beat * TICKS_PER_BEAT,
          durationTicks: TICKS_PER_BEAT * (style === "flowing" ? 1.5 : 0.85),
          velocity: 68,
        }),
      );
    } else {
      const tones = chordPitches(slot.symbol, 52, 76).slice(0, 4);
      const pulse = style === "syncopated" ? [0, 1.5, 3] : style === "flowing" ? [0, 2] : [0];
      pulse.forEach((beat) =>
        tones.forEach((pitch) =>
          result.push({
            trackId: "chords",
            pitch,
            startTick: bar * TICKS_PER_BAR + beat * TICKS_PER_BEAT,
            durationTicks: pulse.length === 1 ? TICKS_PER_BAR - 30 : TICKS_PER_BEAT * 1.35,
            velocity: 58,
          }),
        ),
      );
    }
  }
  return result;
}
