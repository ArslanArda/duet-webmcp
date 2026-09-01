import { Chord, Mode as TonalMode } from "@tonaljs/tonal";
import type { Locale, Mode } from "../types";
import { KEY_CENTERS } from "../types";
import { isValidChord } from "./theory";

/**
 * Plain-language layer over chord symbols. The catalog never decides what is
 * musically valid — tonal does — it only names things for people who do not
 * read chord symbols yet.
 */
export interface ChordQuality {
  id: string;
  suffix: string;
  label: Record<Locale, string>;
  mood: Record<Locale, string>;
}

export const CHORD_QUALITIES: ChordQuality[] = [
  {
    id: "major",
    suffix: "",
    label: { en: "Major", tr: "Majör" },
    mood: { en: "bright, happy", tr: "parlak, mutlu" },
  },
  {
    id: "minor",
    suffix: "m",
    label: { en: "Minor", tr: "Minör" },
    mood: { en: "sad, serious", tr: "hüzünlü, ciddi" },
  },
  {
    id: "dom7",
    suffix: "7",
    label: { en: "Seventh", tr: "Yedili" },
    mood: { en: "bluesy, wants to move on", tr: "blues tadında, ilerlemek ister" },
  },
  {
    id: "maj7",
    suffix: "maj7",
    label: { en: "Major 7", tr: "Majör 7" },
    mood: { en: "soft, dreamy jazz", tr: "yumuşak, rüya gibi caz" },
  },
  {
    id: "min7",
    suffix: "m7",
    label: { en: "Minor 7", tr: "Minör 7" },
    mood: { en: "warm, smooth jazz", tr: "sıcak, yumuşak caz" },
  },
  {
    id: "sus4",
    suffix: "sus4",
    label: { en: "Sus 4", tr: "Sus 4" },
    mood: { en: "floating, unresolved", tr: "askıda, çözülmemiş" },
  },
  {
    id: "sus2",
    suffix: "sus2",
    label: { en: "Sus 2", tr: "Sus 2" },
    mood: { en: "open, airy", tr: "açık, ferah" },
  },
  {
    id: "dim",
    suffix: "dim",
    label: { en: "Diminished", tr: "Eksik" },
    mood: { en: "tense, spooky", tr: "gergin, ürkütücü" },
  },
  {
    id: "aug",
    suffix: "aug",
    label: { en: "Augmented", tr: "Artık" },
    mood: { en: "strange, dreamlike", tr: "tuhaf, rüyamsı" },
  },
  {
    id: "m7b5",
    suffix: "m7b5",
    label: { en: "Half-dim", tr: "Yarı eksik" },
    mood: { en: "dark jazz tension", tr: "karanlık caz gerilimi" },
  },
  {
    id: "add9",
    suffix: "add9",
    label: { en: "Add 9", tr: "Add 9" },
    mood: { en: "sparkling, modern pop", tr: "ışıltılı, modern pop" },
  },
  {
    id: "six",
    suffix: "6",
    label: { en: "Sixth", tr: "Altılı" },
    mood: { en: "sweet, vintage", tr: "tatlı, nostaljik" },
  },
];

const TYPE_TO_QUALITY: Record<string, string> = {
  major: "major",
  minor: "minor",
  "dominant seventh": "dom7",
  "major seventh": "maj7",
  "minor seventh": "min7",
  "suspended fourth": "sus4",
  "suspended second": "sus2",
  diminished: "dim",
  augmented: "aug",
  "half-diminished": "m7b5",
  sixth: "six",
};

export const ROOT_LABELS: Record<(typeof KEY_CENTERS)[number], string> = {
  C: "C",
  "C#": "C♯ / D♭",
  D: "D",
  Eb: "E♭",
  E: "E",
  F: "F",
  "F#": "F♯ / G♭",
  G: "G",
  Ab: "A♭",
  A: "A",
  Bb: "B♭",
  B: "B",
};

/** "Eb" -> "E♭", "F#m7" -> "F♯m7" (only the accidental right after the letter). */
export const prettySymbol = (symbol: string) =>
  symbol.replace(/^([A-G])#/, "$1♯").replace(/^([A-G])b/, "$1♭");

export interface ChordDescription {
  root: string;
  quality: ChordQuality | null;
  label: string;
  mood: string;
}

export function describeChord(symbol: string, locale: Locale): ChordDescription | null {
  const chord = Chord.get(symbol.trim());
  if (chord.empty || !chord.tonic) return null;
  const qualityId = TYPE_TO_QUALITY[chord.type] ?? (chord.aliases.includes("add9") ? "add9" : undefined);
  const quality = CHORD_QUALITIES.find((item) => item.id === qualityId) ?? null;
  return {
    root: chord.tonic,
    quality,
    label: quality ? quality.label[locale] : chord.type || chord.aliases[0] || symbol,
    mood: quality ? quality.mood[locale] : "",
  };
}

export const buildChordSymbol = (root: string, qualityId: string) =>
  `${root}${CHORD_QUALITIES.find((item) => item.id === qualityId)?.suffix ?? ""}`;

export interface ChordSuggestions {
  triads: string[];
  sevenths: string[];
}

/** Chords that naturally belong to the project's key and mode, computed with tonal. */
export function suggestedChords(keyCenter: string, mode: string): ChordSuggestions {
  const modeName = mode === "minor" ? "aeolian" : mode;
  const clean = (list: string[]) =>
    [...new Set(list.map((item) => item.replace("Maj7", "maj7")))].filter(isValidChord);
  return {
    triads: clean(TonalMode.triads(modeName, keyCenter)),
    sevenths: clean(TonalMode.seventhChords(modeName, keyCenter)),
  };
}

export const MODE_MOODS: Record<Mode, Record<Locale, string>> = {
  major: { en: "Bright, happy", tr: "Parlak, mutlu" },
  minor: { en: "Sad, serious", tr: "Hüzünlü, ciddi" },
  dorian: { en: "Sad but hopeful", tr: "Hüzünlü ama umutlu" },
  phrygian: { en: "Mysterious, Spanish", tr: "Gizemli, İspanyol" },
  lydian: { en: "Dreamy, floating", tr: "Rüya gibi, havada" },
  mixolydian: { en: "Relaxed rock & blues", tr: "Rahat rock ve blues" },
  locrian: { en: "Tense, unstable", tr: "Gergin, kararsız" },
};

export function tempoWord(bpm: number, locale: Locale) {
  const words =
    locale === "tr"
      ? ["Çok yavaş", "Yavaş", "Orta", "Hızlı", "Çok hızlı"]
      : ["Very slow", "Slow", "Medium", "Fast", "Very fast"];
  if (bpm < 60) return words[0];
  if (bpm < 85) return words[1];
  if (bpm < 115) return words[2];
  if (bpm < 150) return words[3];
  return words[4];
}

export const TEMPO_PRESETS = [
  { bpm: 70, id: "slow" },
  { bpm: 100, id: "medium" },
  { bpm: 128, id: "fast" },
  { bpm: 160, id: "veryFast" },
] as const;
