import type { ChordSlot, Note, Project } from "../types";
import { PROJECT_BARS, TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";
import { voiceChord } from "../music/voicing";

const progression = [
  "Cm7",
  "Abmaj7",
  "Ebmaj7",
  "Bb7",
  "Cm7",
  "Fm7",
  "G7",
  "Cm7",
  "Cm7",
  "Abmaj7",
  "Ebmaj7",
  "Bb7",
  "Fm7",
  "Abmaj7",
  "G7",
  "Cm7",
];

const melodyPitches = [72, 75, 79, 77, 75, 72, 70, 67, 72, 75, 74, 70, 68, 67, 71, 72];

export function createDemoProject(): Project {
  const chords: ChordSlot[] = progression.map((symbol, bar) => ({ bar, symbol, source: "human" }));
  const chordNotes: Note[] = progression.flatMap((symbol, bar) =>
    voiceChord(symbol, bar).map((draft, index) => ({
      ...draft,
      id: `seed-chord-${bar}-${index}`,
      source: "human" as const,
    })),
  );
  const melody: Note[] = melodyPitches.map((pitch, index) => ({
    id: `seed-melody-${index}`,
    trackId: "melody",
    pitch,
    startTick: index * TICKS_PER_BAR,
    durationTicks: index % 4 === 3 ? TICKS_PER_BEAT * 2 : TICKS_PER_BEAT * 1.5,
    velocity: 84,
    source: "human",
  }));
  return {
    tempo: 100,
    keyCenter: "C",
    mode: "minor",
    barCount: PROJECT_BARS,
    notes: [...chordNotes, ...melody],
    chords,
  };
}

export function createEmptyProject(): Project {
  return { tempo: 100, keyCenter: "C", mode: "major", barCount: PROJECT_BARS, notes: [], chords: [] };
}
