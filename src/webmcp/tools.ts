import { nanoid } from "nanoid";
import { Chord, Note as TonalNote, Scale } from "@tonaljs/tonal";
import { isAudioUnlocked, playProject } from "../audio/player";
import { generateLine } from "../music/generate";
import type { LineRole, LineStyle } from "../music/generate";
import {
  analyzeProjectHarmony,
  deterministicHumanize,
  isValidChord,
  midiToPitchName,
  normalizeMode,
  noteNameToMidi,
  notesInBars,
  quantizeTick,
  remapPitchToMode,
} from "../music/theory";
import { voiceChord } from "../music/voicing";
import { answerPhrase, type AnswerStyle } from "../music/answer";
import { MOOD_LABELS, MOODS, suggestProgressions, type Mood } from "../music/progressions";
import { DEFAULT_INSTRUMENTS } from "../audio/player";
import { liveInput } from "../input/liveInput";
import { useActivityStore } from "./activity";
import { projectStore, validTrackIds } from "../store/projectStore";
import type {
  Draft,
  InstrumentId,
  Locale,
  Note,
  Project,
  Section,
  ToolFailure,
  ToolSuccess,
  TrackId,
} from "../types";
import { INSTRUMENTS, PROJECT_BARS, TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";

const objectSchema = (properties: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const integer = (minimum: number, maximum: number) => ({ type: "integer", minimum, maximum });
const number = (minimum: number, maximum: number) => ({ type: "number", minimum, maximum });
const enumValue = (values: string[]) => ({ type: "string", enum: values });

function failure(code: string, message: string, hint: string, retryable = true): ToolFailure {
  return { ok: false, error: { code, message, hint, retryable } };
}

function barRange(startBar: unknown, endBar: unknown) {
  if (!Number.isInteger(startBar) || !Number.isInteger(endBar))
    return failure(
      "INVALID_RANGE",
      "Bar indices must be integers.",
      "Use whole bar numbers, for example startBar: 0 and endBar: 4.",
    );
  const start = startBar as number;
  const end = endBar as number;
  if (start < 0 || end > PROJECT_BARS || end <= start)
    return failure(
      "BAR_OUT_OF_RANGE",
      `Bars ${start}–${end} are outside this 16-bar project.`,
      "Use startBar from 0–15 and an exclusive endBar from 1–16.",
    );
  return { startBar: start, endBar: end };
}

function resultFromChange(changeId: string): ToolSuccess {
  const state = projectStore.getState();
  const change = state.changeLog.find((entry) => entry.id === changeId)!;
  return {
    ok: true,
    stateVersion: state.stateVersion,
    changeId,
    summary: change.summary,
    explanation: change.explanation,
    affectedBars: change.affectedBars,
    notesAdded: change.notesAdded,
    notesRemoved: change.notesRemoved,
  };
}

function commit(
  nextProject: Project,
  toolName: string,
  summary: string,
  explanation: string,
  affectedBars: { startBar: number; endBar: number },
  id = nanoid(),
) {
  projectStore
    .getState()
    .commitAgentChange({ id, toolName, summary, explanation, affectedBars, nextProject });
  return resultFromChange(id);
}

const MODE_SCHEMA = {
  type: "string",
  enum: ["draft", "apply"],
  description:
    "draft (default): show the result as a ghost preview the person accepts or discards on the page; apply: write immediately because the person explicitly asked for that.",
};
const VERSION_SCHEMA = {
  type: "integer",
  minimum: 0,
  description:
    "Optional stateVersion you last read; the call is rejected if the person changed the page since.",
};

function staleCheck(expected: unknown): ToolFailure | null {
  if (expected === undefined || expected === null) return null;
  const current = projectStore.getState().stateVersion;
  if (expected === current) return null;
  return failure(
    "STALE_STATE",
    `The page changed since state version ${String(expected)} (now ${current}).`,
    "Call get_recent_activity to see what the person did, then retry with the current stateVersion.",
  );
}

const modeOf = (value: unknown, fallback: "draft" | "apply" = "draft") =>
  value === "apply" || value === "draft" ? value : fallback;

interface DraftResult {
  ok: true;
  draft: true;
  stateVersion: number;
  draftId: string;
  label: string;
  summary: string;
  explanation: string;
  affectedBars: { startBar: number; endBar: number };
  pendingDrafts: Array<{ id: string; label: string }>;
  hint: string;
}

function commitOrDraft(
  mode: "draft" | "apply",
  nextProject: Project,
  toolName: string,
  summary: string,
  explanation: string,
  affectedBars: { startBar: number; endBar: number },
  label: string,
  id = nanoid(),
): ToolSuccess | DraftResult {
  if (mode === "apply") return commit(nextProject, toolName, summary, explanation, affectedBars, id);
  const draft: Draft = {
    id,
    label,
    toolName,
    summary,
    explanation,
    affectedBars,
    nextProject,
    createdAt: Date.now(),
  };
  projectStore.getState().addDraft(draft);
  const state = projectStore.getState();
  return {
    ok: true,
    draft: true,
    stateVersion: state.stateVersion,
    draftId: id,
    label,
    summary,
    explanation,
    affectedBars,
    pendingDrafts: state.drafts.map((item) => ({ id: item.id, label: item.label })),
    hint: "The person now sees this as a ghost preview with Listen / Accept / Discard. Nothing is written yet. Ask what they think, or call resolve_draft when they decide.",
  };
}

const barsLabel = (range: { startBar: number; endBar: number }) => `${range.startBar + 1}–${range.endBar}`;

function agentNote(draft: Omit<Note, "id" | "source" | "changeId">, changeId: string): Note {
  return { ...draft, id: nanoid(), source: "agent", changeId };
}

function localeSummary(locale: Locale, en: string, tr: string) {
  return locale === "tr" ? tr : en;
}

export const webMCPTools: WebMCPTool[] = [
  {
    name: "get_project_state",
    description:
      "Use this when you need a concise overview of the live Duet project before choosing an edit. Returns tempo, key, mode, chord track, selection and per-track note summaries without flooding context with every note.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: true },
    execute: () => {
      const state = projectStore.getState();
      const project = state.project;
      const live = liveInput.getState();
      const notesSummary = Object.fromEntries(
        validTrackIds.map((trackId) => {
          const notes = project.notes.filter((note) => note.trackId === trackId);
          const pitches = notes.map((note) => note.pitch);
          const bars = [...new Set(notes.map((note) => Math.floor(note.startTick / TICKS_PER_BAR)))].sort(
            (a, b) => a - b,
          );
          return [
            trackId,
            {
              count: notes.length,
              pitchRange: notes.length
                ? {
                    low: Math.min(...pitches),
                    high: Math.max(...pitches),
                    lowName: midiToPitchName(Math.min(...pitches)),
                    highName: midiToPitchName(Math.max(...pitches)),
                  }
                : null,
              occupiedBars: bars,
            },
          ];
        }),
      );
      return {
        ok: true,
        stateVersion: state.stateVersion,
        tempo: project.tempo,
        keyCenter: project.keyCenter,
        mode: project.mode,
        barCount: project.barCount,
        selection: state.selection,
        notesSummary,
        chords: project.chords,
        sections: project.sections ?? [],
        instruments: { ...DEFAULT_INSTRUMENTS, ...(project.instruments ?? {}) },
        ui: {
          activeTrack: state.activeTrack,
          selectionSource: state.selectionSource,
          isPlaying: state.isPlaying,
          isLooping: state.isLooping,
          isRecording: state.isRecording,
          visibleBars: live.visibleBars,
          pendingDrafts: state.drafts.map((draft) => ({
            id: draft.id,
            label: draft.label,
            affectedBars: draft.affectedBars,
          })),
          lastTake: live.lastTake
            ? {
                trackId: live.lastTake.trackId,
                startBar: live.lastTake.startBar,
                endBar: live.lastTake.endBar,
                noteCount: live.lastTake.ids.length,
                chordsDetected: live.lastTake.chordsDetected,
              }
            : null,
          canUndo: state.past.length > 0,
        },
      };
    },
  },
  {
    name: "get_selection",
    description:
      "Use this when you need the exact notes and chord context inside the bars currently selected by the person.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: true },
    execute: () => {
      const { project, selection, stateVersion } = projectStore.getState();
      if (!selection)
        return {
          ok: true,
          stateVersion,
          selection: null,
          hint: "Ask the user to select bars, or call set_selection.",
        };
      const notes = notesInBars(
        project.notes.filter((note) => note.trackId === selection.trackId),
        selection.startBar,
        selection.endBar,
      ).map((note) => ({
        pitch: note.pitch,
        pitchName: midiToPitchName(note.pitch),
        startBeat: note.startTick / TICKS_PER_BEAT,
        durationBeats: note.durationTicks / TICKS_PER_BEAT,
        velocity: note.velocity,
        source: note.source,
      }));
      return {
        ok: true,
        stateVersion,
        selection,
        notes,
        chords: project.chords.filter(
          (slot) => slot.bar >= selection.startBar && slot.bar < selection.endBar,
        ),
      };
    },
  },
  {
    name: "analyze_harmony",
    description:
      "Use this when you need deterministic harmonic analysis of a selected or explicit bar range. Duet computes chord functions and scale fit with tonal instead of guessing.",
    inputSchema: objectSchema({ startBar: integer(0, 15), endBar: integer(1, 16) }),
    annotations: { readOnlyHint: true },
    execute: (args) => {
      const state = projectStore.getState();
      const startBar = args.startBar ?? state.selection?.startBar;
      const endBar = args.endBar ?? state.selection?.endBar;
      if (startBar === undefined || endBar === undefined)
        return failure(
          "NO_SELECTION",
          "There is no selected or explicit bar range to analyze.",
          "Call set_selection first, or provide startBar and endBar.",
        );
      const range = barRange(startBar, endBar);
      if ("ok" in range) return range;
      return {
        ok: true,
        stateVersion: state.stateVersion,
        ...analyzeProjectHarmony(state.project, range.startBar, range.endBar),
      };
    },
  },
  {
    name: "set_selection",
    description:
      "Use this when you want to visibly focus the person's editor on a track and bar range before reading or changing it. This changes only the shared cursor, not the music.",
    inputSchema: objectSchema(
      { trackId: enumValue(validTrackIds), startBar: integer(0, 15), endBar: integer(1, 16) },
      ["trackId", "startBar", "endBar"],
    ),
    execute: (args) => {
      const range = barRange(args.startBar, args.endBar);
      if ("ok" in range) return range;
      if (!validTrackIds.includes(args.trackId as TrackId))
        return failure(
          "INVALID_TRACK",
          `Track '${String(args.trackId)}' does not exist.`,
          "Use melody, bass, or chords.",
        );
      projectStore.getState().setActiveTrack(args.trackId as TrackId);
      projectStore.getState().setSelection({ trackId: args.trackId as TrackId, ...range }, "agent");
      return {
        ok: true,
        stateVersion: projectStore.getState().stateVersion,
        selection: { trackId: args.trackId, ...range },
        summary: `Selected ${args.trackId} bars ${range.startBar + 1}–${range.endBar}.`,
      };
    },
  },
  {
    name: "set_chord_progression",
    description:
      "Use this when the person asks for a chord progression. Replaces consecutive chord slots from startBar, validates every symbol, and creates audible block or arpeggiated chord notes.",
    inputSchema: objectSchema(
      {
        startBar: integer(0, 15),
        chords: {
          type: "array",
          minItems: 1,
          maxItems: 16,
          items: { type: "string", minLength: 1, maxLength: 16 },
        },
        voicing: enumValue(["block", "arpeggio"]),
        mode: MODE_SCHEMA,
        expectedStateVersion: VERSION_SCHEMA,
      },
      ["startBar", "chords"],
    ),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      const chords = args.chords as string[];
      const startBar = args.startBar as number;
      const endBar = startBar + chords.length;
      const range = barRange(startBar, endBar);
      if ("ok" in range) return range;
      const invalid = chords.find((symbol) => !isValidChord(symbol));
      if (invalid)
        return failure(
          "INVALID_CHORD",
          `'${invalid}' is not a recognizable chord symbol.`,
          "Use standard notation such as Cmaj7, F#m7b5, Bb7, or Cm.",
        );
      const state = projectStore.getState();
      const id = nanoid();
      const startTick = startBar * TICKS_PER_BAR;
      const endTick = endBar * TICKS_PER_BAR;
      const created = chords.flatMap((symbol, index) =>
        voiceChord(
          symbol,
          startBar + index,
          (args.voicing as "block" | "arpeggio" | undefined) ?? "block",
        ).map((draft) => agentNote(draft, id)),
      );
      const nextProject: Project = {
        ...state.project,
        chords: [
          ...state.project.chords.filter((slot) => slot.bar < startBar || slot.bar >= endBar),
          ...chords.map((symbol, index) => ({
            bar: startBar + index,
            symbol,
            source: "agent" as const,
            changeId: id,
          })),
        ].sort((a, b) => a.bar - b.bar),
        notes: [
          ...state.project.notes.filter(
            (note) => note.trackId !== "chords" || note.startTick < startTick || note.startTick >= endTick,
          ),
          ...created,
        ],
      };
      const summary = localeSummary(
        state.locale,
        `AI set ${chords.length} chords in bars ${startBar + 1}–${endBar}.`,
        `AI ${startBar + 1}–${endBar}. ölçülere ${chords.length} akor ekledi.`,
      );
      const explanation = localeSummary(
        state.locale,
        `The progression ${chords.join(" – ")} was voiced inside a comfortable keyboard range so every symbol is visible and audible.`,
        `${chords.join(" – ")} progresyonu, her akor hem görünür hem duyulur olacak şekilde rahat bir klavye aralığında seslendirildi.`,
      );
      return commitOrDraft(
        modeOf(args.mode),
        nextProject,
        "set_chord_progression",
        summary,
        explanation,
        range,
        chords.join(" – "),
        id,
      );
    },
  },
  {
    name: "add_notes",
    description:
      "Use this when you know the exact notes to add to melody, bass, or chords. Note names and beat positions are validated and converted to Duet's internal ticks.",
    inputSchema: objectSchema(
      {
        trackId: enumValue(validTrackIds),
        notes: {
          type: "array",
          minItems: 1,
          maxItems: 128,
          items: objectSchema(
            {
              pitchName: { type: "string", minLength: 2, maxLength: 8 },
              startBeat: number(0, 64),
              durationBeats: number(0.0625, 64),
              velocity: integer(1, 127),
            },
            ["pitchName", "startBeat", "durationBeats"],
          ),
        },
        mode: MODE_SCHEMA,
        expectedStateVersion: VERSION_SCHEMA,
      },
      ["trackId", "notes"],
    ),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      const trackId = args.trackId as TrackId;
      if (!validTrackIds.includes(trackId))
        return failure(
          "INVALID_TRACK",
          `Track '${String(trackId)}' does not exist.`,
          "Use melody, bass, or chords.",
        );
      const drafts = args.notes as Array<{
        pitchName: string;
        startBeat: number;
        durationBeats: number;
        velocity?: number;
      }>;
      for (const draft of drafts) {
        const midi = noteNameToMidi(draft.pitchName);
        if (midi === null)
          return failure(
            "INVALID_NOTE",
            `'${draft.pitchName}' is not a valid pitched note.`,
            "Use a note name with octave, such as C4, F#3, or Bb5.",
          );
        if (draft.startBeat < 0 || draft.startBeat + draft.durationBeats > PROJECT_BARS * 4)
          return failure(
            "NOTE_OUT_OF_RANGE",
            `Note '${draft.pitchName}' extends outside the 16-bar project.`,
            "Use startBeat from 0 up to 64 and keep the note's end at or before beat 64.",
          );
      }
      const state = projectStore.getState();
      const id = nanoid();
      const created = drafts.map((draft) =>
        agentNote(
          {
            trackId,
            pitch: noteNameToMidi(draft.pitchName)!,
            startTick: Math.round(draft.startBeat * TICKS_PER_BEAT),
            durationTicks: Math.max(30, Math.round(draft.durationBeats * TICKS_PER_BEAT)),
            velocity: draft.velocity ?? 84,
          },
          id,
        ),
      );
      const startBar = Math.floor(Math.min(...created.map((note) => note.startTick)) / TICKS_PER_BAR);
      const endBar = Math.min(
        PROJECT_BARS,
        Math.ceil(Math.max(...created.map((note) => note.startTick + note.durationTicks)) / TICKS_PER_BAR),
      );
      const nextProject = { ...state.project, notes: [...state.project.notes, ...created] };
      const chordToneCount = created.filter((note) => {
        const symbol = state.project.chords.find(
          (slot) => slot.bar === Math.floor(note.startTick / TICKS_PER_BAR),
        )?.symbol;
        return symbol
          ? Chord.get(symbol).notes.includes(TonalNote.pitchClass(midiToPitchName(note.pitch)))
          : false;
      }).length;
      const summary = localeSummary(
        state.locale,
        `AI added ${created.length} notes to ${trackId}.`,
        `AI ${trackId} kanalına ${created.length} nota ekledi.`,
      );
      const explanation = localeSummary(
        state.locale,
        `${chordToneCount} added notes align directly with the local chord material; all timing and pitches were validated before insertion.`,
        `Eklenen notaların ${chordToneCount} tanesi doğrudan mevcut akor malzemesiyle eşleşiyor; tüm zaman ve ses değerleri eklenmeden önce doğrulandı.`,
      );
      return commitOrDraft(
        modeOf(args.mode),
        nextProject,
        "add_notes",
        summary,
        explanation,
        { startBar, endBar },
        `${created.length} notes → ${trackId}`,
        id,
      );
    },
  },
  {
    name: "transform_selection",
    description:
      "Use this when the person asks to transpose, change mode, quantize, or humanize the currently selected notes. Mode changes preserve melodic contour with deterministic tonal mapping.",
    inputSchema: objectSchema(
      {
        operation: enumValue(["transpose", "change_mode", "quantize", "humanize"]),
        amount: number(-24, 60),
        targetMode: enumValue(["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian"]),
        mode: MODE_SCHEMA,
        expectedStateVersion: VERSION_SCHEMA,
      },
      ["operation"],
    ),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      const state = projectStore.getState();
      const selection = state.selection;
      if (!selection)
        return failure(
          "NO_SELECTION",
          "There is no selected range to transform.",
          "Ask the user to select bars, or call set_selection first.",
        );
      const selectedIds = new Set(
        notesInBars(
          state.project.notes.filter((note) => note.trackId === selection.trackId),
          selection.startBar,
          selection.endBar,
        ).map((note) => note.id),
      );
      if (!selectedIds.size)
        return failure(
          "EMPTY_SELECTION",
          "The selected track contains no notes in that range.",
          "Select bars that contain notes, or add notes before transforming.",
        );
      const operation = args.operation as string;
      const amount = Number(args.amount ?? 0);
      const targetMode = String(args.targetMode ?? "");
      if (operation === "transpose" && (!Number.isInteger(amount) || amount < -24 || amount > 24))
        return failure(
          "INVALID_AMOUNT",
          "Transpose amount must be an integer from -24 to 24 semitones.",
          "Retry with amount: 2 for a whole step, or amount: -12 for one octave down.",
        );
      if (operation === "quantize" && amount !== 8 && amount !== 16)
        return failure(
          "INVALID_AMOUNT",
          "Quantize amount must be 8 or 16.",
          "Use amount: 16 for sixteenth-note snapping or amount: 8 for eighth notes.",
        );
      if (operation === "humanize" && (amount < 0 || amount > 60))
        return failure(
          "INVALID_AMOUNT",
          "Humanize amount must be from 0 to 60 ticks.",
          "Try amount: 20 for a subtle result.",
        );
      if (
        operation === "change_mode" &&
        Scale.get(`${state.project.keyCenter} ${normalizeMode(targetMode)}`).empty
      )
        return failure(
          "INVALID_MODE",
          `'${targetMode}' is not a supported mode.`,
          "Use major, minor, dorian, phrygian, lydian, mixolydian, or locrian.",
        );
      const id = nanoid();
      const notes = state.project.notes.map((note) => {
        if (!selectedIds.has(note.id)) return note;
        let transformed = { ...note, source: "agent" as const, changeId: id };
        if (operation === "transpose") transformed.pitch = Math.max(0, Math.min(127, note.pitch + amount));
        if (operation === "quantize") {
          transformed.startTick = quantizeTick(note.startTick, amount as 8 | 16);
          transformed.durationTicks = Math.max(30, quantizeTick(note.durationTicks, amount as 8 | 16));
        }
        if (operation === "humanize")
          transformed = { ...deterministicHumanize(transformed, amount), source: "agent", changeId: id };
        if (operation === "change_mode")
          transformed.pitch = remapPitchToMode(
            note.pitch,
            state.project.keyCenter,
            state.project.mode,
            targetMode,
          );
        return transformed;
      });
      const nextProject = { ...state.project, notes };
      const action =
        operation === "change_mode"
          ? `to ${targetMode}`
          : operation === "transpose"
            ? `by ${amount} semitones`
            : `with ${amount}`;
      const summary = localeSummary(
        state.locale,
        `AI transformed ${selectedIds.size} notes ${action}.`,
        `AI seçili ${selectedIds.size} notayı ${action} dönüştürdü.`,
      );
      const explanation =
        operation === "change_mode"
          ? localeSummary(
              state.locale,
              `Pitches were mapped from ${state.project.mode} to ${targetMode} on the same ${state.project.keyCenter} tonic while preserving the melodic contour.`,
              `Sesler, melodik kontur korunarak aynı ${state.project.keyCenter} toniği üzerinde ${state.project.mode} modundan ${targetMode} moduna eşlendi.`,
            )
          : localeSummary(
              state.locale,
              `The ${operation} operation used a bounded, repeatable rule, so the result can be reproduced and undone exactly.`,
              `${operation} işlemi sınırlı ve tekrarlanabilir bir kuralla uygulandı; sonuç birebir yeniden üretilebilir ve geri alınabilir.`,
            );
      return commitOrDraft(
        modeOf(args.mode),
        nextProject,
        "transform_selection",
        summary,
        explanation,
        { startBar: selection.startBar, endBar: selection.endBar },
        operation === "change_mode" ? `→ ${targetMode}` : `${operation} ${amount}`,
        id,
      );
    },
  },
  {
    name: "generate_line",
    description:
      "Use this when the person asks Duet to write a bass, counter melody, or pad over existing chords. Generation follows deterministic chord-tone and voice-leading rules.",
    inputSchema: objectSchema(
      {
        role: enumValue(["bass", "counter_melody", "pad"]),
        startBar: integer(0, 15),
        endBar: integer(1, 16),
        style: enumValue(["simple", "flowing", "syncopated"]),
        mode: MODE_SCHEMA,
        expectedStateVersion: VERSION_SCHEMA,
      },
      ["role", "startBar", "endBar"],
    ),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      const range = barRange(args.startBar, args.endBar);
      if ("ok" in range) return range;
      const state = projectStore.getState();
      const role = args.role as LineRole;
      const style = (args.style as LineStyle | undefined) ?? "simple";
      const missing = Array.from(
        { length: range.endBar - range.startBar },
        (_, index) => range.startBar + index,
      ).filter((bar) => !state.project.chords.some((slot) => slot.bar === bar));
      if (missing.length)
        return failure(
          "MISSING_CHORDS",
          `No chord is set in bar ${missing[0] + 1}.`,
          "Set a chord progression for the requested range, then retry generate_line.",
        );
      const drafts = generateLine(state.project, role, range.startBar, range.endBar, style);
      if (!drafts.length)
        return failure(
          "GENERATION_EMPTY",
          "The deterministic generator could not create a line from this chord range.",
          "Verify the chord symbols with get_project_state, then retry.",
        );
      const id = nanoid();
      const created = drafts.map((draft) => agentNote(draft, id));
      const startTick = range.startBar * TICKS_PER_BAR;
      const endTick = range.endBar * TICKS_PER_BAR;
      const targetTrack: TrackId = role === "bass" ? "bass" : role === "pad" ? "chords" : "melody";
      const preserveExisting = role === "counter_melody";
      const baseNotes = preserveExisting
        ? state.project.notes
        : state.project.notes.filter(
            (note) => note.trackId !== targetTrack || note.startTick < startTick || note.startTick >= endTick,
          );
      const nextProject = { ...state.project, notes: [...baseNotes, ...created] };
      const strong = created.filter((note) => note.startTick % TICKS_PER_BEAT === 0).length;
      const summary = localeSummary(
        state.locale,
        `AI wrote a ${style} ${role.replace("_", " ")} with ${created.length} notes.`,
        `AI ${created.length} notalık ${style} bir ${role.replace("_", " ")} yazdı.`,
      );
      const explanation = localeSummary(
        state.locale,
        `${strong} notes land on strong beats; their pitches come from each bar's chord tones and stepwise connections.`,
        `${strong} nota güçlü vuruşlara denk geliyor; sesler her ölçünün akor seslerinden ve basamaklı bağlantılardan türetildi.`,
      );
      return commitOrDraft(
        modeOf(args.mode),
        nextProject,
        "generate_line",
        summary,
        explanation,
        range,
        `${style} ${role.replace("_", " ")}`,
        id,
      );
    },
  },
  {
    name: "set_tempo",
    description:
      "Use this when the person asks to change playback speed. Duet safely clamps the requested tempo to 40–220 BPM and reports the applied value.",
    inputSchema: objectSchema({ bpm: number(-1000, 1000), expectedStateVersion: VERSION_SCHEMA }, ["bpm"]),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      if (typeof args.bpm !== "number" || !Number.isFinite(args.bpm))
        return failure(
          "INVALID_TEMPO",
          "Tempo must be a finite number.",
          "Retry with a BPM such as 90 or 120.",
        );
      const state = projectStore.getState();
      const requested = args.bpm;
      const applied = Math.max(40, Math.min(220, Math.round(requested)));
      const nextProject = { ...state.project, tempo: applied };
      const id = nanoid();
      const summary = localeSummary(
        state.locale,
        `AI set the tempo to ${applied} BPM.`,
        `AI tempoyu ${applied} BPM yaptı.`,
      );
      const explanation = localeSummary(
        state.locale,
        requested === applied
          ? `The project now plays at ${applied} beats per minute.`
          : `The requested ${requested} BPM was safely limited to Duet's ${applied} BPM boundary.`,
        requested === applied
          ? `Proje artık dakikada ${applied} vuruş hızında çalıyor.`
          : `İstenen ${requested} BPM, güvenli Duet sınırı olan ${applied} BPM'e çekildi.`,
      );
      return commit(
        nextProject,
        "set_tempo",
        summary,
        explanation,
        { startBar: 0, endBar: state.project.barCount },
        id,
      );
    },
  },
  {
    name: "play",
    description:
      "Use this when the person asks to listen to the project or a bar range. Starts Duet's existing browser playback; if sound has not been unlocked, returns a clear user-action request.",
    inputSchema: objectSchema({
      startBar: integer(0, 15),
      endBar: integer(1, 16),
      loop: { type: "boolean" },
    }),
    execute: (args) => {
      const state = projectStore.getState();
      const startBar = (args.startBar as number | undefined) ?? 0;
      const endBar = (args.endBar as number | undefined) ?? state.project.barCount;
      const range = barRange(startBar, endBar);
      if ("ok" in range) return range;
      if (!isAudioUnlocked())
        return {
          ok: false,
          requiresUserAction: true,
          error: {
            code: "AUDIO_LOCKED",
            message: "Browser audio needs one user gesture before an agent can start playback.",
            hint: "Ask the user to press Play once, then retry.",
            retryable: true,
          },
        };
      playProject(state.project, range.startBar, range.endBar, {
        loop: Boolean(args.loop),
        onEnded: () => projectStore.getState().setPlaying(false),
      });
      projectStore.getState().setPlaying(true);
      projectStore.getState().setLooping(Boolean(args.loop));
      return {
        ok: true,
        stateVersion: projectStore.getState().stateVersion,
        playing: true,
        loop: Boolean(args.loop),
        affectedBars: range,
        summary: `Playing bars ${range.startBar + 1}–${range.endBar}.`,
      };
    },
  },

  {
    name: "get_recent_activity",
    description:
      "Use this at the start of a turn to see what the person did on the page since you last looked: recorded takes, notes added or deleted, chords set, selection moves, undo, drafts they accepted or discarded. Lets you react to their playing instead of asking.",
    inputSchema: objectSchema({ sinceStateVersion: integer(0, 1000000), limit: integer(1, 40) }),
    annotations: { readOnlyHint: true },
    execute: (args) => {
      const state = projectStore.getState();
      const since = typeof args.sinceStateVersion === "number" ? args.sinceStateVersion : -1;
      const limit = typeof args.limit === "number" ? args.limit : 15;
      const live = liveInput.getState();
      const humanEvents = state.humanLog
        .filter((event) => event.stateVersion > since)
        .slice(0, limit)
        .map((event) => ({
          type: event.type,
          trackId: event.trackId,
          bars: event.bars ? { startBar: event.bars.startBar, endBar: event.bars.endBar } : undefined,
          count: event.count,
          detail: event.detail,
          secondsAgo: Math.round((Date.now() - event.timestamp) / 1000),
          stateVersion: event.stateVersion,
        }));
      const agentCalls = useActivityStore
        .getState()
        .activities.slice(0, 10)
        .map((item) => ({
          tool: item.tool,
          status: item.status,
          secondsAgo: Math.round((Date.now() - item.startedAt) / 1000),
        }));
      return {
        ok: true,
        stateVersion: state.stateVersion,
        humanEvents,
        lastTake: live.lastTake
          ? {
              trackId: live.lastTake.trackId,
              startBar: live.lastTake.startBar,
              endBar: live.lastTake.endBar,
              noteCount: live.lastTake.ids.length,
            }
          : null,
        pendingDrafts: state.drafts.map((draft) => ({
          id: draft.id,
          label: draft.label,
          affectedBars: draft.affectedBars,
        })),
        agentCalls,
        hint: humanEvents.length
          ? "Mention what you noticed in one short sentence before acting, e.g. 'I see you just recorded two bars on Melody'."
          : "Nothing new from the person since that version.",
      };
    },
  },
  {
    name: "suggest_progressions",
    description:
      "Use this when the person describes a feeling (happy, sad, dreamy, tense, epic, jazzy, calm) instead of chord names. Returns chord progressions realized in the project's key with a one-line reason each, so you can offer choices in plain words or install one with set_chord_progression / propose_variations.",
    inputSchema: objectSchema({ mood: enumValue([...MOODS]), bars: integer(1, 16) }, ["mood"]),
    annotations: { readOnlyHint: true },
    execute: (args) => {
      const state = projectStore.getState();
      const mood = args.mood as Mood;
      if (!MOODS.includes(mood))
        return failure(
          "INVALID_MOOD",
          `'${String(args.mood)}' is not a known mood.`,
          `Use one of: ${MOODS.join(", ")}.`,
        );
      const bars =
        typeof args.bars === "number"
          ? args.bars
          : state.selection
            ? state.selection.endBar - state.selection.startBar
            : 4;
      const options = suggestProgressions(state.project.keyCenter, mood, bars, state.locale);
      return {
        ok: true,
        stateVersion: state.stateVersion,
        mood,
        moodLabel: MOOD_LABELS[mood][state.locale],
        keyCenter: state.project.keyCenter,
        currentMode: state.project.mode,
        bars,
        options,
        hint: "Describe two or three of these to the person in everyday words, or call propose_variations with kind 'chords' so they can hear them side by side.",
      };
    },
  },
  {
    name: "propose_variations",
    description:
      "Use this to let the person choose by ear. Creates 2–3 alternative drafts for the same bars (chords by mood, or bass / pad / counter melody in different styles, or answers to a phrase). Each appears on the page as a lettered option with Listen / Accept / Discard; nothing is written until one is accepted.",
    inputSchema: objectSchema(
      {
        kind: enumValue(["chords", "bass", "pad", "counter_melody", "answer"]),
        startBar: integer(0, 15),
        endBar: integer(1, 16),
        count: integer(2, 3),
        moods: { type: "array", minItems: 1, maxItems: 3, items: enumValue([...MOODS]) },
        styles: { type: "array", minItems: 1, maxItems: 3, items: { type: "string", maxLength: 16 } },
        expectedStateVersion: VERSION_SCHEMA,
      },
      ["kind", "startBar", "endBar"],
    ),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      const range = barRange(args.startBar, args.endBar);
      if ("ok" in range) return range;
      const state = projectStore.getState();
      const kind = args.kind as string;
      const count = typeof args.count === "number" ? args.count : 2;
      const bars = range.endBar - range.startBar;
      const startTick = range.startBar * TICKS_PER_BAR;
      const endTick = range.endBar * TICKS_PER_BAR;
      const created: Array<{ id: string; label: string; summary: string }> = [];
      const addDraft = (
        label: string,
        nextProject: Project,
        toolName: string,
        summary: string,
        explanation: string,
      ) => {
        const id = nanoid();
        projectStore.getState().addDraft({
          id,
          label,
          toolName,
          summary,
          explanation,
          affectedBars: range,
          nextProject,
          createdAt: Date.now(),
        });
        created.push({ id, label, summary });
      };
      if (kind === "chords") {
        const defaults: Mood[] = ["minor", "dorian", "phrygian", "locrian"].includes(state.project.mode)
          ? ["sad", "epic", "dreamy"]
          : ["happy", "dreamy", "jazzy"];
        const moods = (
          Array.isArray(args.moods) && args.moods.length ? (args.moods as Mood[]) : defaults
        ).slice(0, count);
        moods.forEach((mood) => {
          const option = suggestProgressions(state.project.keyCenter, mood, bars, state.locale)[0];
          if (!option) return;
          const id = nanoid();
          const notes = option.chords.flatMap((symbol, index) =>
            voiceChord(symbol, range.startBar + index).map((draft) => agentNote(draft, id)),
          );
          const nextProject: Project = {
            ...state.project,
            chords: [
              ...state.project.chords.filter((slot) => slot.bar < range.startBar || slot.bar >= range.endBar),
              ...option.chords.map((symbol, index) => ({
                bar: range.startBar + index,
                symbol,
                source: "agent" as const,
                changeId: id,
              })),
            ].sort((a, b) => a.bar - b.bar),
            notes: [
              ...state.project.notes.filter(
                (note) =>
                  note.trackId !== "chords" || note.startTick < startTick || note.startTick >= endTick,
              ),
              ...notes,
            ],
          };
          addDraft(
            `${MOOD_LABELS[mood][state.locale]} · ${option.chords.join(" – ")}`,
            nextProject,
            "set_chord_progression",
            localeSummary(
              state.locale,
              `AI set ${option.chords.length} chords in bars ${barsLabel(range)} (${option.label}).`,
              `AI ${barsLabel(range)}. ölçülere ${option.chords.length} akor koydu (${option.label}).`,
            ),
            option.why,
          );
        });
      } else if (kind === "answer") {
        const styles: AnswerStyle[] = (
          Array.isArray(args.styles)
            ? (args.styles as AnswerStyle[])
            : (["echo", "sequence", "invert"] as AnswerStyle[])
        ).slice(0, count);
        const sourceStart = Math.max(0, range.startBar - bars);
        styles.forEach((style) => {
          const line = answerPhrase(state.project, sourceStart, range.startBar, range.startBar, bars, style);
          if (!line.length) return;
          const id = nanoid();
          const notes = line.map((draft) => agentNote(draft, id));
          const nextProject: Project = {
            ...state.project,
            notes: [
              ...state.project.notes.filter(
                (note) =>
                  note.trackId !== "melody" || note.startTick < startTick || note.startTick >= endTick,
              ),
              ...notes,
            ],
          };
          addDraft(
            `${style} · ${notes.length} notes`,
            nextProject,
            "answer_phrase",
            localeSummary(
              state.locale,
              `AI answered your phrase in bars ${barsLabel(range)} (${style}).`,
              `AI ${barsLabel(range)}. ölçülerde cümlene cevap verdi (${style}).`,
            ),
            localeSummary(
              state.locale,
              `Your rhythm is kept; pitches are moved through the ${state.project.keyCenter} ${state.project.mode} scale and pulled onto chord tones on strong beats.`,
              `Ritmin korundu; sesler ${state.project.keyCenter} ${state.project.mode} gamı içinde taşındı ve güçlü vuruşlarda akor seslerine çekildi.`,
            ),
          );
        });
      } else {
        const role = kind as LineRole;
        const missing = Array.from({ length: bars }, (_, index) => range.startBar + index).filter(
          (bar) => !state.project.chords.some((slot) => slot.bar === bar),
        );
        if (missing.length)
          return failure(
            "MISSING_CHORDS",
            `No chord is set in bar ${missing[0] + 1}.`,
            "Set a chord progression for the requested range first (or propose chords), then retry.",
          );
        const styles: LineStyle[] = (
          Array.isArray(args.styles)
            ? (args.styles as LineStyle[])
            : (["simple", "flowing", "syncopated"] as LineStyle[])
        ).slice(0, count);
        const targetTrack: TrackId = role === "bass" ? "bass" : role === "pad" ? "chords" : "melody";
        styles.forEach((style) => {
          const line = generateLine(state.project, role, range.startBar, range.endBar, style);
          if (!line.length) return;
          const id = nanoid();
          const notes = line.map((draft) => agentNote(draft, id));
          const base =
            role === "counter_melody"
              ? state.project.notes
              : state.project.notes.filter(
                  (note) =>
                    note.trackId !== targetTrack || note.startTick < startTick || note.startTick >= endTick,
                );
          addDraft(
            `${style} ${role.replace("_", " ")} · ${notes.length} notes`,
            { ...state.project, notes: [...base, ...notes] },
            "generate_line",
            localeSummary(
              state.locale,
              `AI wrote a ${style} ${role.replace("_", " ")} in bars ${barsLabel(range)}.`,
              `AI ${barsLabel(range)}. ölçülere ${style} bir ${role.replace("_", " ")} yazdı.`,
            ),
            localeSummary(
              state.locale,
              `Pitches come from each bar's chord tones; the ${style} style decides the rhythm.`,
              `Sesler her ölçünün akor seslerinden geliyor; ritmi ${style} stili belirliyor.`,
            ),
          );
        });
      }
      if (!created.length)
        return failure(
          "NO_VARIATIONS",
          "No variation could be generated for that range.",
          "Check the range has chords (for lines) or a phrase before it (for answers), then retry.",
        );
      return {
        ok: true,
        stateVersion: projectStore.getState().stateVersion,
        affectedBars: range,
        drafts: created,
        hint: "The options are on the page as A/B/C. Ask the person which one they like after listening; then call resolve_draft with that draftId (or they will click Accept).",
      };
    },
  },
  {
    name: "answer_phrase",
    description:
      "Call and response. Takes the phrase the person just played or selected on the Melody track and writes an answering phrase in the following bars: same rhythm, moved through the key (echo, sequence, invert or contrast), landing on chord tones. Defaults to the last recorded take, then the selection. Returns a draft the person can hear and accept.",
    inputSchema: objectSchema(
      {
        sourceStartBar: integer(0, 15),
        sourceEndBar: integer(1, 16),
        targetStartBar: integer(0, 15),
        answerBars: integer(1, 4),
        style: enumValue(["echo", "sequence", "invert", "contrast"]),
        mode: MODE_SCHEMA,
        expectedStateVersion: VERSION_SCHEMA,
      },
      [],
    ),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      const state = projectStore.getState();
      const take = liveInput.getState().lastTake;
      const source =
        typeof args.sourceStartBar === "number" && typeof args.sourceEndBar === "number"
          ? { startBar: args.sourceStartBar, endBar: args.sourceEndBar }
          : take && take.trackId === "melody"
            ? { startBar: take.startBar, endBar: take.endBar }
            : state.selection
              ? { startBar: state.selection.startBar, endBar: state.selection.endBar }
              : null;
      if (!source)
        return failure(
          "NO_PHRASE",
          "There is no phrase to answer.",
          "Ask the person to play or select a few bars on Melody, or pass sourceStartBar/sourceEndBar.",
        );
      const sourceRange = barRange(source.startBar, source.endBar);
      if ("ok" in sourceRange) return sourceRange;
      const answerBars =
        typeof args.answerBars === "number" ? args.answerBars : sourceRange.endBar - sourceRange.startBar;
      const targetStart = typeof args.targetStartBar === "number" ? args.targetStartBar : sourceRange.endBar;
      const target = barRange(targetStart, targetStart + answerBars);
      if ("ok" in target)
        return failure(
          "NO_ROOM",
          `The answer would run past bar 16.`,
          "Pass a smaller answerBars or an earlier targetStartBar.",
        );
      const style = (args.style as AnswerStyle | undefined) ?? "echo";
      const line = answerPhrase(
        state.project,
        sourceRange.startBar,
        sourceRange.endBar,
        target.startBar,
        answerBars,
        style,
      );
      if (!line.length)
        return failure(
          "NO_PHRASE",
          `Bars ${barsLabel(sourceRange)} of Melody contain no notes.`,
          "Point sourceStartBar/sourceEndBar at bars where the person played.",
        );
      const id = nanoid();
      const notes = line.map((draft) => agentNote(draft, id));
      const startTick = target.startBar * TICKS_PER_BAR;
      const endTick = target.endBar * TICKS_PER_BAR;
      const nextProject: Project = {
        ...state.project,
        notes: [
          ...state.project.notes.filter(
            (note) => note.trackId !== "melody" || note.startTick < startTick || note.startTick >= endTick,
          ),
          ...notes,
        ],
      };
      const summary = localeSummary(
        state.locale,
        `AI answered your phrase from bars ${barsLabel(sourceRange)} in bars ${barsLabel(target)}.`,
        `AI ${barsLabel(sourceRange)}. ölçülerdeki cümlene ${barsLabel(target)}. ölçülerde cevap verdi.`,
      );
      const explanation = localeSummary(
        state.locale,
        `Same rhythm as your phrase; pitches moved through the ${state.project.keyCenter} ${state.project.mode} scale (${style}) and pulled onto chord tones on strong beats, ending on a resting note.`,
        `Ritmin aynı; sesler ${state.project.keyCenter} ${state.project.mode} gamı içinde taşındı (${style}), güçlü vuruşlarda akor seslerine çekildi ve dinlenen bir notada bitti.`,
      );
      return commitOrDraft(
        modeOf(args.mode),
        nextProject,
        "answer_phrase",
        summary,
        explanation,
        target,
        `${style} answer · ${notes.length} notes`,
        id,
      );
    },
  },
  {
    name: "resolve_draft",
    description:
      "Accept or discard drafts you proposed. Use after the person tells you which option they like; accepting writes it to the song as a normal undoable change. Without draftId, acts on the option currently previewed on the page.",
    inputSchema: objectSchema(
      { action: enumValue(["accept", "discard", "discard_all"]), draftId: { type: "string", maxLength: 32 } },
      ["action"],
    ),
    execute: (args) => {
      const state = projectStore.getState();
      const action = args.action as string;
      if (action === "discard_all") {
        state.discardDraft("all");
        return {
          ok: true,
          stateVersion: projectStore.getState().stateVersion,
          summary: "All drafts discarded.",
        };
      }
      const id =
        (typeof args.draftId === "string" && args.draftId) ||
        state.activeDraftId ||
        state.drafts[state.drafts.length - 1]?.id;
      const draft = state.drafts.find((item) => item.id === id);
      if (!draft)
        return failure(
          "NO_DRAFT",
          "There is no pending draft with that id.",
          "Call get_project_state to see ui.pendingDrafts, or propose a new one.",
        );
      if (action === "discard") {
        state.discardDraft(draft.id);
        return {
          ok: true,
          stateVersion: projectStore.getState().stateVersion,
          summary: `Draft '${draft.label}' discarded.`,
        };
      }
      const change = state.acceptDraft(draft.id);
      if (!change) return failure("NO_DRAFT", "The draft could not be accepted.", "Propose it again.");
      return resultFromChange(change.id);
    },
  },
  {
    name: "set_sections",
    description:
      "Label parts of the song (Intro, Verse, Chorus…) on the bar ruler so you and the person can talk about 'the chorus' instead of bar numbers. Replaces all labels; each starts at a bar and runs until the next.",
    inputSchema: objectSchema(
      {
        sections: {
          type: "array",
          minItems: 0,
          maxItems: 8,
          items: objectSchema(
            { startBar: integer(0, 15), name: { type: "string", minLength: 1, maxLength: 24 } },
            ["startBar", "name"],
          ),
        },
        expectedStateVersion: VERSION_SCHEMA,
      },
      ["sections"],
    ),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      const sections = (args.sections as Section[]).map((section) => ({
        startBar: Math.floor(section.startBar),
        name: section.name.trim(),
      }));
      if (new Set(sections.map((section) => section.startBar)).size !== sections.length)
        return failure(
          "DUPLICATE_SECTION",
          "Two sections start at the same bar.",
          "Give every section a different startBar.",
        );
      const state = projectStore.getState();
      const id = nanoid();
      const nextProject: Project = {
        ...state.project,
        sections: [...sections].sort((a, b) => a.startBar - b.startBar),
      };
      const names = sections.map((section) => section.name).join(", ");
      return commit(
        nextProject,
        "set_sections",
        localeSummary(
          state.locale,
          `AI labeled ${sections.length} sections: ${names}.`,
          `AI ${sections.length} bölüm etiketledi: ${names}.`,
        ),
        localeSummary(
          state.locale,
          "Labels only change how the song is described; no notes were touched.",
          "Etiketler yalnızca şarkının anlatımını değiştirir; hiçbir notaya dokunulmadı.",
        ),
        { startBar: 0, endBar: state.project.barCount },
        id,
      );
    },
  },
  {
    name: "set_instrument",
    description:
      "Change the sound of a track: piano, epiano, strings, pad, bass or pluck. Cheap and instantly audible; good when the person says 'softer', 'warmer' or 'like strings'.",
    inputSchema: objectSchema(
      {
        trackId: enumValue(validTrackIds),
        instrument: enumValue([...INSTRUMENTS]),
        expectedStateVersion: VERSION_SCHEMA,
      },
      ["trackId", "instrument"],
    ),
    execute: (args) => {
      const stale = staleCheck(args.expectedStateVersion);
      if (stale) return stale;
      const trackId = args.trackId as TrackId;
      const instrument = args.instrument as InstrumentId;
      if (!validTrackIds.includes(trackId))
        return failure(
          "INVALID_TRACK",
          `Track '${String(trackId)}' does not exist.`,
          "Use melody, bass, or chords.",
        );
      if (!INSTRUMENTS.includes(instrument))
        return failure(
          "INVALID_INSTRUMENT",
          `'${String(instrument)}' is not a sound.`,
          `Use one of: ${INSTRUMENTS.join(", ")}.`,
        );
      const state = projectStore.getState();
      const nextProject: Project = {
        ...state.project,
        instruments: { ...(state.project.instruments ?? {}), [trackId]: instrument },
      };
      return commit(
        nextProject,
        "set_instrument",
        localeSummary(
          state.locale,
          `AI changed the ${trackId} sound to ${instrument}.`,
          `AI ${trackId} sesini ${instrument} yaptı.`,
        ),
        localeSummary(
          state.locale,
          "Only the timbre changed; every note stays where it was.",
          "Sadece tını değişti; tüm notalar yerinde.",
        ),
        { startBar: 0, endBar: state.project.barCount },
        nanoid(),
      );
    },
  },
];
