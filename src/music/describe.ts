import { Chord, Note as TonalNote } from "@tonaljs/tonal";
import type { Locale, Project, TrackId } from "../types";
import { TICKS_PER_BAR, TICKS_PER_BEAT, TRACK_IDS } from "../types";
import { midiToPitchName, scaleChromas } from "./theory";

/**
 * A deterministic diagnosis of a bar range in plain language, so the agent
 * reads what is missing instead of guessing it from raw note counts.
 */
export interface Finding {
  code: string;
  severity: "info" | "suggestion";
  text: string;
  trackId?: TrackId;
  bars?: { startBar: number; endBar: number };
  /** A tool call that would address the finding, ready to pass along. */
  action?: { tool: string; args: Record<string, unknown> };
}

export interface Description {
  range: { startBar: number; endBar: number };
  tracks: Record<
    TrackId,
    { count: number; distinctPitches: number; notesPerBar: number; range: string | null }
  >;
  chordsPresent: number;
  findings: Finding[];
}

const T = (locale: Locale, en: string, tr: string) => (locale === "tr" ? tr : en);
const bars = (locale: Locale, start: number, end: number) =>
  T(locale, `bars ${start + 1}–${end}`, `${start + 1}–${end}. ölçüler`);

export function describeRange(
  project: Project,
  startBar: number,
  endBar: number,
  locale: Locale,
): Description {
  const start = startBar * TICKS_PER_BAR;
  const end = endBar * TICKS_PER_BAR;
  const barCount = endBar - startBar;
  const inRange = project.notes.filter((note) => note.startTick >= start && note.startTick < end);
  const chordsInRange = project.chords.filter((slot) => slot.bar >= startBar && slot.bar < endBar);
  const scale = scaleChromas(project.keyCenter, project.mode);
  const findings: Finding[] = [];
  const range = { startBar, endBar };

  const tracks = Object.fromEntries(
    TRACK_IDS.map((trackId) => {
      const notes = inRange.filter((note) => note.trackId === trackId);
      const pitches = notes.map((note) => note.pitch);
      return [
        trackId,
        {
          count: notes.length,
          distinctPitches: new Set(pitches.map((pitch) => pitch % 12)).size,
          notesPerBar: Math.round((notes.length / Math.max(1, barCount)) * 10) / 10,
          range: notes.length
            ? `${midiToPitchName(Math.min(...pitches))}–${midiToPitchName(Math.max(...pitches))}`
            : null,
        },
      ];
    }),
  ) as Description["tracks"];

  // Chords: missing or static.
  const missingChordBars = Array.from({ length: barCount }, (_, i) => startBar + i).filter(
    (bar) => !chordsInRange.some((slot) => slot.bar === bar),
  );
  if (missingChordBars.length === barCount) {
    findings.push({
      code: "NO_CHORDS",
      severity: "suggestion",
      bars: range,
      trackId: "chords",
      text: T(
        locale,
        `There are no chords in ${bars(locale, startBar, endBar)}; everything else has nothing to lean on.`,
        `${bars(locale, startBar, endBar)} arasında hiç akor yok; diğer her şey dayanaksız kalıyor.`,
      ),
      action: { tool: "propose_variations", args: { kind: "chords", startBar, endBar, count: 3 } },
    });
  } else if (missingChordBars.length) {
    findings.push({
      code: "CHORD_GAPS",
      severity: "suggestion",
      bars: range,
      trackId: "chords",
      text: T(
        locale,
        `Bars ${missingChordBars.map((bar) => bar + 1).join(", ")} have no chord.`,
        `${missingChordBars.map((bar) => bar + 1).join(", ")}. ölçülerde akor yok.`,
      ),
    });
  } else if (barCount >= 4 && new Set(chordsInRange.map((slot) => slot.symbol)).size === 1) {
    findings.push({
      code: "STATIC_CHORDS",
      severity: "suggestion",
      bars: range,
      trackId: "chords",
      text: T(
        locale,
        `The same chord (${chordsInRange[0].symbol}) sits under all ${barCount} bars; nothing moves harmonically.`,
        `${barCount} ölçü boyunca aynı akor (${chordsInRange[0].symbol}); armonik olarak hiçbir şey hareket etmiyor.`,
      ),
      action: {
        tool: "suggest_progressions",
        args: { mood: project.mode === "minor" ? "sad" : "happy", bars: barCount },
      },
    });
  }

  // Empty tracks.
  if (!tracks.bass.count && chordsInRange.length) {
    findings.push({
      code: "NO_BASS",
      severity: "suggestion",
      trackId: "bass",
      bars: range,
      text: T(
        locale,
        "The Bass track is empty here, so the low end is missing.",
        "Bas kulvarı burada boş; alt frekanslar eksik.",
      ),
      action: { tool: "propose_variations", args: { kind: "bass", startBar, endBar, count: 3 } },
    });
  }
  if (!tracks.melody.count) {
    findings.push({
      code: "NO_MELODY",
      severity: "suggestion",
      trackId: "melody",
      bars: range,
      text: T(locale, "There is no melody in this range.", "Bu aralıkta melodi yok."),
      action: chordsInRange.length
        ? { tool: "generate_line", args: { role: "counter_melody", startBar, endBar, style: "flowing" } }
        : undefined,
    });
  }

  // Melody character.
  const melody = inRange
    .filter((note) => note.trackId === "melody")
    .sort((a, b) => a.startTick - b.startTick);
  if (melody.length >= 4) {
    if (tracks.melody.distinctPitches <= 2)
      findings.push({
        code: "MELODY_STATIC",
        severity: "suggestion",
        trackId: "melody",
        bars: range,
        text: T(
          locale,
          `The melody uses only ${tracks.melody.distinctPitches} different notes; it circles in place.`,
          `Melodi yalnızca ${tracks.melody.distinctPitches} farklı nota kullanıyor; yerinde dönüyor.`,
        ),
        action: {
          tool: "answer_phrase",
          args: { sourceStartBar: startBar, sourceEndBar: Math.min(endBar, startBar + 2), style: "sequence" },
        },
      });
    const leaps = melody
      .slice(1)
      .filter((note, index) => Math.abs(note.pitch - melody[index].pitch) > 7).length;
    if (leaps >= Math.ceil(melody.length / 3))
      findings.push({
        code: "MELODY_JUMPY",
        severity: "info",
        trackId: "melody",
        bars: range,
        text: T(
          locale,
          `The melody leaps more than a fifth ${leaps} times; it may sound restless.`,
          `Melodi ${leaps} kez beşliden büyük atlıyor; huzursuz duyulabilir.`,
        ),
      });
    if (tracks.melody.notesPerBar < 1 && barCount >= 2)
      findings.push({
        code: "MELODY_SPARSE",
        severity: "info",
        trackId: "melody",
        bars: range,
        text: T(
          locale,
          "The melody is sparse: less than one note per bar.",
          "Melodi seyrek: ölçü başına birden az nota.",
        ),
      });
  }

  // Notes that clash with the chord on strong beats, or fall outside the key.
  const clashes: string[] = [];
  const outOfKey: string[] = [];
  inRange
    .filter((note) => note.trackId !== "chords")
    .forEach((note) => {
      const bar = Math.floor(note.startTick / TICKS_PER_BAR);
      const name = midiToPitchName(note.pitch);
      const pc = TonalNote.pitchClass(name);
      if (!scale.has(note.pitch % 12)) outOfKey.push(`${name} (${T(locale, "bar", "ölçü")} ${bar + 1})`);
      const chord = chordsInRange.find((slot) => slot.bar === bar);
      const strong =
        note.startTick % TICKS_PER_BEAT === 0 &&
        ((note.startTick % TICKS_PER_BAR) / TICKS_PER_BEAT) % 2 === 0;
      if (
        chord &&
        strong &&
        note.durationTicks >= TICKS_PER_BEAT / 2 &&
        !Chord.get(chord.symbol).notes.includes(pc)
      )
        clashes.push(
          `${name} ${T(locale, "over", "üzerinde")} ${chord.symbol} (${T(locale, "bar", "ölçü")} ${bar + 1})`,
        );
    });
  if (clashes.length)
    findings.push({
      code: "CHORD_CLASHES",
      severity: "info",
      bars: range,
      text: T(
        locale,
        `${clashes.length} long notes on strong beats are not in their chord: ${clashes.slice(0, 3).join("; ")}.`,
        `Güçlü vuruştaki ${clashes.length} uzun nota akorunun dışında: ${clashes.slice(0, 3).join("; ")}.`,
      ),
    });
  if (outOfKey.length)
    findings.push({
      code: "OUT_OF_KEY",
      severity: "info",
      bars: range,
      text: T(
        locale,
        `${outOfKey.length} notes fall outside ${project.keyCenter} ${project.mode}: ${outOfKey.slice(0, 3).join(", ")}.`,
        `${outOfKey.length} nota ${project.keyCenter} ${project.mode} dışında: ${outOfKey.slice(0, 3).join(", ")}.`,
      ),
    });

  if (!findings.length)
    findings.push({
      code: "BALANCED",
      severity: "info",
      bars: range,
      text: T(
        locale,
        "Chords, bass and melody are all present and in key; nothing obvious is missing.",
        "Akorlar, bas ve melodi mevcut ve tonun içinde; bariz bir eksik yok.",
      ),
    });

  return { range, tracks, chordsPresent: chordsInRange.length, findings };
}
