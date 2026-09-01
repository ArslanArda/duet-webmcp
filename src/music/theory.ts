import { Chord, Note as TonalNote, Scale } from "@tonaljs/tonal";
import type { ChordSlot, Note, Project } from "../types";
import { TICKS_PER_BAR } from "../types";

const MODE_ALIASES: Record<string, string> = {
  major: "major",
  minor: "aeolian",
  dorian: "dorian",
  phrygian: "phrygian",
  lydian: "lydian",
  mixolydian: "mixolydian",
  locrian: "locrian",
};

export const normalizeMode = (mode: string) => MODE_ALIASES[mode.toLowerCase()] ?? mode.toLowerCase();

export function noteNameToMidi(name: string): number | null {
  const midi = TonalNote.midi(name.trim());
  return midi === null || midi < 0 || midi > 127 ? null : midi;
}

export function midiToPitchName(midi: number): string {
  return TonalNote.fromMidi(Math.max(0, Math.min(127, Math.round(midi))));
}

export function isValidChord(symbol: string): boolean {
  const chord = Chord.get(symbol.trim());
  return !chord.empty && Boolean(chord.tonic) && chord.notes.length > 0;
}

export function scalePitchClasses(keyCenter: string, mode: string): string[] {
  const scale = Scale.get(`${keyCenter} ${normalizeMode(mode)}`);
  return scale.empty ? Scale.get(`${keyCenter} major`).notes : scale.notes;
}

function circularDistance(a: number, b: number) {
  const distance = Math.abs(a - b) % 12;
  return Math.min(distance, 12 - distance);
}

export function remapPitchToMode(
  pitch: number,
  keyCenter: string,
  fromMode: string,
  targetMode: string,
): number {
  const source = scalePitchClasses(keyCenter, fromMode);
  const target = scalePitchClasses(keyCenter, targetMode);
  if (!source.length || !target.length) return pitch;
  const chroma = ((pitch % 12) + 12) % 12;
  const sourceChromas = source.map((note) => TonalNote.chroma(note) ?? 0);
  let degree = 0;
  let bestDistance = 13;
  sourceChromas.forEach((candidate, index) => {
    const distance = circularDistance(chroma, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      degree = index;
    }
  });
  const targetChroma = TonalNote.chroma(target[degree % target.length]) ?? chroma;
  const octaveBase = Math.floor(pitch / 12) * 12;
  const candidates = [
    octaveBase + targetChroma - 12,
    octaveBase + targetChroma,
    octaveBase + targetChroma + 12,
  ];
  return Math.max(0, Math.min(127, candidates.sort((a, b) => Math.abs(a - pitch) - Math.abs(b - pitch))[0]));
}

export function quantizeTick(tick: number, subdivision: 8 | 16): number {
  const step = 1920 / subdivision;
  return Math.max(0, Math.round(tick / step) * step);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return hash >>> 0;
}

export function deterministicHumanize(note: Note, amount: number): Note {
  const normalized = Math.max(0, Math.min(60, Math.round(amount)));
  const hash = stableHash(note.id);
  const offset = (hash % (normalized * 2 + 1)) - normalized;
  const velocityOffset = ((hash >>> 8) % 9) - 4;
  return {
    ...note,
    startTick: Math.max(0, note.startTick + offset),
    velocity: Math.max(1, Math.min(127, note.velocity + velocityOffset)),
  };
}

const ROMANS = ["I", "♭II", "II", "♭III", "III", "IV", "♭V", "V", "♭VI", "VI", "♭VII", "VII"];

export function romanForChord(symbol: string, keyCenter: string): string | null {
  const chord = Chord.get(symbol);
  const tonicChroma = TonalNote.chroma(chord.tonic ?? "");
  const keyChroma = TonalNote.chroma(keyCenter);
  if (tonicChroma === null || keyChroma === null) return null;
  const degree = (tonicChroma - keyChroma + 12) % 12;
  const base = ROMANS[degree];
  const minor = /minor| m\b/i.test(chord.type) || /^m/.test(chord.aliases[0] ?? "");
  const diminished = /dim/i.test(chord.type);
  return `${minor ? base.toLowerCase() : base}${diminished ? "°" : ""}`;
}

export interface HarmonyAnalysis {
  range: { startBar: number; endBar: number };
  detectedChords: Array<{ bar: number; symbol: string; roman: string | null }>;
  bestFitMode: string;
  pitchClasses: string[];
}

export function analyzeProjectHarmony(project: Project, startBar: number, endBar: number): HarmonyAnalysis {
  const start = startBar * TICKS_PER_BAR;
  const end = endBar * TICKS_PER_BAR;
  const notes = project.notes.filter(
    (note) => note.startTick < end && note.startTick + note.durationTicks > start,
  );
  const pitchClasses = [
    ...new Set(notes.map((note) => TonalNote.pitchClass(midiToPitchName(note.pitch)))),
  ].filter(Boolean);
  const candidateModes = ["major", "minor", "dorian", "mixolydian", "lydian", "phrygian"];
  const bestFitMode =
    candidateModes
      .map((mode) => ({
        mode,
        score: pitchClasses.filter((pc) => scalePitchClasses(project.keyCenter, mode).includes(pc)).length,
      }))
      .sort((a, b) => b.score - a.score)[0]?.mode ?? project.mode;
  const slots = project.chords.filter((slot) => slot.bar >= startBar && slot.bar < endBar);
  return {
    range: { startBar, endBar },
    pitchClasses,
    bestFitMode,
    detectedChords: slots.map((slot) => ({
      bar: slot.bar,
      symbol: slot.symbol,
      roman: romanForChord(slot.symbol, project.keyCenter),
    })),
  };
}

export function notesInBars(notes: Note[], startBar: number, endBar: number): Note[] {
  const start = startBar * TICKS_PER_BAR;
  const end = endBar * TICKS_PER_BAR;
  return notes.filter((note) => note.startTick < end && note.startTick + note.durationTicks > start);
}

export function chordsInBars(chords: ChordSlot[], startBar: number, endBar: number): ChordSlot[] {
  return chords.filter((chord) => chord.bar >= startBar && chord.bar < endBar);
}

/** Chromas (0-11) of the pitches that belong to the key's scale; used to shade the grid. */
export function scaleChromas(keyCenter: string, mode: string): Set<number> {
  return new Set(
    scalePitchClasses(keyCenter, mode)
      .map((note) => TonalNote.chroma(note))
      .filter((chroma): chroma is number => chroma !== null && chroma !== undefined),
  );
}
