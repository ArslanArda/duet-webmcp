import { nanoid } from "nanoid";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  AgentChangeInput,
  Change,
  Draft,
  EditorMode,
  HumanEvent,
  InstrumentId,
  HistoryEntry,
  InversePatch,
  Locale,
  Note,
  NoteSource,
  Project,
  Quantize,
  Section,
  Selection,
  TrackId,
} from "../types";
import { PROJECT_BARS, TICKS_PER_BAR, TRACK_IDS } from "../types";
import { applyDraftPatch } from "./drafts";
import { createDemoProject, createEmptyProject } from "./seed";

const HISTORY_LIMIT = 100;

function noteChanged(a: Note, b: Note) {
  return (
    a.pitch !== b.pitch ||
    a.startTick !== b.startTick ||
    a.durationTicks !== b.durationTicks ||
    a.velocity !== b.velocity ||
    a.trackId !== b.trackId
  );
}

function createInversePatch(before: Project, after: Project): InversePatch {
  const beforeMap = new Map(before.notes.map((note) => [note.id, note]));
  const afterMap = new Map(after.notes.map((note) => [note.id, note]));
  const removeNoteIds = after.notes
    .filter((note) => !beforeMap.has(note.id) || noteChanged(beforeMap.get(note.id)!, note))
    .map((note) => note.id);
  const restoreNotes = before.notes.filter(
    (note) => !afterMap.has(note.id) || noteChanged(note, afterMap.get(note.id)!),
  );
  const chordBars = new Set<number>();
  const serialize = (slot: Project["chords"][number] | undefined) =>
    slot ? `${slot.symbol}|${slot.source}|${slot.changeId ?? ""}` : "";
  for (let bar = 0; bar < before.barCount; bar += 1) {
    if (
      serialize(before.chords.find((slot) => slot.bar === bar)) !==
      serialize(after.chords.find((slot) => slot.bar === bar))
    )
      chordBars.add(bar);
  }
  return {
    removeNoteIds,
    restoreNotes,
    affectedChordBars: [...chordBars],
    restoreChords: before.chords.filter((slot) => chordBars.has(slot.bar)),
    previousTempo: before.tempo !== after.tempo ? before.tempo : undefined,
    previousKeyCenter: before.keyCenter !== after.keyCenter ? before.keyCenter : undefined,
    previousMode: before.mode !== after.mode ? before.mode : undefined,
    previousSections:
      JSON.stringify(before.sections ?? []) !== JSON.stringify(after.sections ?? [])
        ? (before.sections ?? [])
        : undefined,
    previousInstruments:
      JSON.stringify(before.instruments ?? {}) !== JSON.stringify(after.instruments ?? {})
        ? (before.instruments ?? {})
        : undefined,
  };
}

const HUMAN_LOG_LIMIT = 40;

interface HistoryOptions {
  /** Push the current state onto the undo stack before applying. */
  history?: boolean;
}

export interface ProjectState {
  project: Project;
  selection: Selection | null;
  /** Who made the current selection; agent selections are drawn in amber. */
  selectionSource: NoteSource;
  changeLog: Change[];
  stateVersion: number;
  past: HistoryEntry[];
  future: HistoryEntry[];
  /** Agent proposals awaiting the person's decision. */
  drafts: Draft[];
  activeDraftId: string | null;
  /** What the person did recently, for get_recent_activity. */
  humanLog: HumanEvent[];
  activeTrack: TrackId;
  editorMode: EditorMode;
  locale: Locale;
  /** [pressed play, added a note, asked the AI] */
  onboarding: [boolean, boolean, boolean];
  guideDismissed: boolean;
  isPlaying: boolean;
  isLooping: boolean;
  isRecording: boolean;
  quantize: Quantize;
  /** Loop recording: add each pass on top, or clear the range first. */
  recordMode: "layer" | "replace";
  midiDevice: string | null;
  midiSupported: boolean;
  announcement: string;

  setSelection: (selection: Selection | null, source?: NoteSource) => void;
  setActiveTrack: (trackId: TrackId) => void;
  setEditorMode: (mode: EditorMode) => void;
  setLocale: (locale: Locale) => void;
  setProjectMeta: (patch: Partial<Pick<Project, "tempo" | "keyCenter" | "mode">>) => void;
  setSections: (sections: Section[]) => void;
  setInstrument: (trackId: TrackId, instrument: InstrumentId) => void;
  logHuman: (event: Omit<HumanEvent, "timestamp" | "stateVersion">) => void;
  addDraft: (draft: Draft) => void;
  setActiveDraft: (id: string | null) => void;
  acceptDraft: (id: string) => Change | null;
  discardDraft: (id: string | "all") => void;
  addHumanNote: (note: Omit<Note, "id" | "source">, options?: HistoryOptions) => string;
  updateHumanNote: (
    id: string,
    patch: Partial<Pick<Note, "pitch" | "startTick" | "durationTicks" | "velocity">>,
    options?: HistoryOptions,
  ) => void;
  deleteHumanNote: (id: string, options?: HistoryOptions) => void;
  deleteInRange: (selection: Selection) => void;
  setHumanChord: (bar: number, symbol: string, chordNotes: Note[]) => void;
  clearHumanChord: (bar: number) => void;
  /** Record the current state as an undo step without changing anything (start of a drag). */
  snapshot: () => void;
  undo: () => boolean;
  redo: () => boolean;
  commitAgentChange: (input: AgentChangeInput) => Change;
  undoChange: (id: string) => void;
  newProject: () => void;
  loadDemoProject: () => void;
  setPlaying: (value: boolean) => void;
  setLooping: (value: boolean) => void;
  setRecording: (value: boolean) => void;
  setQuantize: (value: Quantize) => void;
  setRecordMode: (value: "layer" | "replace") => void;
  /** Change only the chord symbol of a bar (keeps the recorded chord-track notes). */
  setChordSymbol: (bar: number, symbol: string, options?: HistoryOptions) => void;
  removeNotes: (ids: string[]) => void;
  setMidiStatus: (supported: boolean, device: string | null) => void;
  completeOnboarding: (index: 0 | 1 | 2) => void;
  resetOnboarding: () => void;
  dismissGuide: () => void;
  setAnnouncement: (message: string) => void;
}

const safeStorage = {
  getItem(name: string) {
    const value = localStorage.getItem(name);
    if (!value) return null;
    try {
      JSON.parse(value);
      return value;
    } catch {
      localStorage.setItem(`${name}:recovery`, value);
      return null;
    }
  },
  setItem: (name: string, value: string) => localStorage.setItem(name, value),
  removeItem: (name: string) => localStorage.removeItem(name),
};

const detectLocale = (): Locale =>
  typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("tr") ? "tr" : "en";

/** The pieces of state that travel together through undo/redo. */
const pushHistory = (state: ProjectState) => ({
  past: [...state.past.slice(-(HISTORY_LIMIT - 1)), { project: state.project, changeLog: state.changeLog }],
  future: [] as HistoryEntry[],
});

const barTicks = (bar: number) => bar * TICKS_PER_BAR;

const pushLog = (state: ProjectState, event: Omit<HumanEvent, "timestamp" | "stateVersion">): HumanEvent[] =>
  [{ ...event, timestamp: Date.now(), stateVersion: state.stateVersion + 1 }, ...state.humanLog].slice(
    0,
    HUMAN_LOG_LIMIT,
  );

const barsOf = (note: Pick<Note, "startTick" | "durationTicks">) => ({
  startBar: Math.floor(note.startTick / TICKS_PER_BAR),
  endBar: Math.min(PROJECT_BARS, Math.ceil((note.startTick + note.durationTicks) / TICKS_PER_BAR)),
});

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => {
      const apply = (
        state: ProjectState,
        nextProject: Project,
        options: HistoryOptions & { changeLog?: Change[]; extra?: Partial<ProjectState> } = {},
      ): Partial<ProjectState> => ({
        ...(options.history === false ? {} : pushHistory(state)),
        project: nextProject,
        changeLog: options.changeLog ?? state.changeLog,
        stateVersion: state.stateVersion + 1,
        ...options.extra,
      });

      return {
        project: createDemoProject(),
        selection: null,
        selectionSource: "human",
        changeLog: [],
        stateVersion: 1,
        past: [],
        future: [],
        drafts: [],
        activeDraftId: null,
        humanLog: [],
        activeTrack: "melody",
        editorMode: "draw",
        locale: detectLocale(),
        onboarding: [false, false, false],
        guideDismissed: false,
        isPlaying: false,
        isLooping: false,
        isRecording: false,
        quantize: 16,
        recordMode: "layer",
        midiDevice: null,
        midiSupported: typeof navigator !== "undefined" && "requestMIDIAccess" in navigator,
        announcement: "",

        setSelection: (selection, source = "human") =>
          set((state) => ({
            selection,
            selectionSource: source,
            stateVersion: state.stateVersion + 1,
            humanLog:
              source === "human" && selection
                ? pushLog(state, { type: "selection", trackId: selection.trackId, bars: selection })
                : state.humanLog,
          })),
        logHuman: (event) => set((state) => ({ humanLog: pushLog(state, event) })),
        setSections: (sections) =>
          set((state) =>
            apply(state, {
              ...state.project,
              sections: [...sections].sort((a, b) => a.startBar - b.startBar),
            }),
          ),
        setInstrument: (trackId, instrument) =>
          set((state) =>
            apply(state, {
              ...state.project,
              instruments: { ...(state.project.instruments ?? {}), [trackId]: instrument },
            }),
          ),
        addDraft: (draft) =>
          set((state) => ({ drafts: [...state.drafts, draft].slice(-4), activeDraftId: draft.id })),
        setActiveDraft: (activeDraftId) => set({ activeDraftId }),
        acceptDraft: (id) => {
          const draft = get().drafts.find((item) => item.id === id);
          if (!draft) return null;
          const change = get().commitAgentChange({
            id: draft.id,
            toolName: draft.toolName,
            summary: draft.summary,
            explanation: draft.explanation,
            affectedBars: draft.affectedBars,
            nextProject: applyDraftPatch(get().project, draft),
          });
          set((state) => {
            const remaining = state.drafts.filter((item) => item.groupId !== draft.groupId);
            return {
              drafts: remaining,
              activeDraftId: remaining[remaining.length - 1]?.id ?? null,
              humanLog: pushLog(state, { type: "draft_accepted", bars: draft.affectedBars, detail: draft.label }),
            };
          });
          return change;
        },
        discardDraft: (id) =>
          set((state) => {
            const remaining = id === "all" ? [] : state.drafts.filter((item) => item.id !== id);
            return {
              drafts: remaining,
              activeDraftId: remaining.some((item) => item.id === state.activeDraftId)
                ? state.activeDraftId
                : (remaining[remaining.length - 1]?.id ?? null),
              humanLog: pushLog(state, { type: "draft_discarded", detail: id === "all" ? "all" : id }),
            };
          }),
        setActiveTrack: (activeTrack) =>
          set((state) => ({
            activeTrack,
            selection: state.selection ? { ...state.selection, trackId: activeTrack } : null,
          })),
        setEditorMode: (editorMode) => set({ editorMode }),
        setLocale: (locale) => {
          if (typeof document !== "undefined" && document.documentElement)
            document.documentElement.lang = locale;
          set({ locale });
        },
        setProjectMeta: (patch) => set((state) => apply(state, { ...state.project, ...patch })),

        addHumanNote: (input, options) => {
          const id = nanoid();
          set((state) =>
            apply(
              state,
              { ...state.project, notes: [...state.project.notes, { ...input, id, source: "human" }] },
              {
                ...options,
                extra: {
                  onboarding: [state.onboarding[0], true, state.onboarding[2]],
                  humanLog: pushLog(state, {
                    type: "notes_added",
                    trackId: input.trackId,
                    bars: barsOf(input),
                    count: 1,
                  }),
                },
              },
            ),
          );
          return id;
        },
        updateHumanNote: (id, patch, options = { history: false }) =>
          set((state) =>
            apply(
              state,
              {
                ...state.project,
                notes: state.project.notes.map((note) =>
                  note.id === id ? { ...note, ...patch, source: "human", changeId: undefined } : note,
                ),
              },
              options,
            ),
          ),
        deleteHumanNote: (id, options) =>
          set((state) =>
            apply(
              state,
              { ...state.project, notes: state.project.notes.filter((note) => note.id !== id) },
              {
                ...options,
                extra: (() => {
                  const note = state.project.notes.find((item) => item.id === id);
                  return note
                    ? {
                        humanLog: pushLog(state, {
                          type: "notes_deleted",
                          trackId: note.trackId,
                          bars: barsOf(note),
                          count: 1,
                        }),
                      }
                    : undefined;
                })(),
              },
            ),
          ),
        deleteInRange: (selection) =>
          set((state) => {
            const startTick = barTicks(selection.startBar);
            const endTick = barTicks(selection.endBar);
            return apply(state, {
              ...state.project,
              notes: state.project.notes.filter(
                (note) =>
                  note.trackId !== selection.trackId ||
                  note.startTick >= endTick ||
                  note.startTick + note.durationTicks <= startTick,
              ),
              chords:
                selection.trackId === "chords"
                  ? state.project.chords.filter(
                      (slot) => slot.bar < selection.startBar || slot.bar >= selection.endBar,
                    )
                  : state.project.chords,
            });
          }),
        setHumanChord: (bar, symbol, chordNotes) =>
          set((state) => {
            const start = barTicks(bar);
            const end = barTicks(bar + 1);
            return apply(state, {
              ...state.project,
              chords: [
                ...state.project.chords.filter((slot) => slot.bar !== bar),
                { bar, symbol, source: "human" as const },
              ].sort((a, b) => a.bar - b.bar),
              notes: [
                ...state.project.notes.filter(
                  (note) => note.trackId !== "chords" || note.startTick < start || note.startTick >= end,
                ),
                ...chordNotes,
              ],
            });
          }),
        clearHumanChord: (bar) =>
          set((state) => {
            const start = barTicks(bar);
            const end = barTicks(bar + 1);
            return apply(state, {
              ...state.project,
              chords: state.project.chords.filter((slot) => slot.bar !== bar),
              notes: state.project.notes.filter(
                (note) => note.trackId !== "chords" || note.startTick < start || note.startTick >= end,
              ),
            });
          }),
        snapshot: () => set((state) => pushHistory(state)),
        undo: () => {
          const state = get();
          const entry = state.past[state.past.length - 1];
          if (!entry) return false;
          set({
            past: state.past.slice(0, -1),
            future: [{ project: state.project, changeLog: state.changeLog }, ...state.future].slice(
              0,
              HISTORY_LIMIT,
            ),
            project: entry.project,
            changeLog: entry.changeLog,
            stateVersion: state.stateVersion + 1,
            humanLog: pushLog(state, { type: "undo" }),
          });
          return true;
        },
        redo: () => {
          const state = get();
          const [entry, ...rest] = state.future;
          if (!entry) return false;
          set({
            future: rest,
            past: [
              ...state.past.slice(-(HISTORY_LIMIT - 1)),
              { project: state.project, changeLog: state.changeLog },
            ],
            project: entry.project,
            changeLog: entry.changeLog,
            stateVersion: state.stateVersion + 1,
            humanLog: pushLog(state, { type: "redo" }),
          });
          return true;
        },

        commitAgentChange: (input) => {
          const before = get().project;
          const inversePatch = createInversePatch(before, input.nextProject);
          const beforeIds = new Set(before.notes.map((note) => note.id));
          const afterIds = new Set(input.nextProject.notes.map((note) => note.id));
          const change: Change = {
            id: input.id,
            toolName: input.toolName,
            summary: input.summary,
            explanation: input.explanation,
            affectedBars: input.affectedBars,
            notesAdded: input.nextProject.notes.filter((note) => !beforeIds.has(note.id)).length,
            notesRemoved: before.notes.filter((note) => !afterIds.has(note.id)).length,
            inversePatch,
            timestamp: Date.now(),
          };
          set((state) =>
            apply(state, input.nextProject, {
              changeLog: [change, ...state.changeLog].slice(0, 10),
              extra: { announcement: input.summary },
            }),
          );
          return change;
        },
        undoChange: (id) =>
          set((state) => {
            const change = state.changeLog.find((entry) => entry.id === id);
            if (!change) return state;
            const patch = change.inversePatch;
            const removeIds = new Set(patch.removeNoteIds);
            const affectedBars = new Set(patch.affectedChordBars);
            return apply(
              state,
              {
                ...state.project,
                tempo: patch.previousTempo ?? state.project.tempo,
                keyCenter: patch.previousKeyCenter ?? state.project.keyCenter,
                mode: patch.previousMode ?? state.project.mode,
                sections: patch.previousSections ?? state.project.sections,
                instruments: patch.previousInstruments ?? state.project.instruments,
                notes: [
                  ...state.project.notes.filter((note) => !removeIds.has(note.id)),
                  ...patch.restoreNotes,
                ],
                chords: [
                  ...state.project.chords.filter((slot) => !affectedBars.has(slot.bar)),
                  ...patch.restoreChords,
                ].sort((a, b) => a.bar - b.bar),
              },
              { changeLog: state.changeLog.filter((entry) => entry.id !== id) },
            );
          }),

        newProject: () =>
          set((state) =>
            apply(state, createEmptyProject(), {
              changeLog: [],
              extra: {
                selection: null,
                drafts: [],
                activeDraftId: null,
                humanLog: pushLog(state, { type: "project_reset", detail: "empty" }),
              },
            }),
          ),
        loadDemoProject: () =>
          set((state) =>
            apply(state, createDemoProject(), {
              changeLog: [],
              extra: {
                selection: null,
                drafts: [],
                activeDraftId: null,
                humanLog: pushLog(state, { type: "project_reset", detail: "demo" }),
              },
            }),
          ),

        setPlaying: (isPlaying) => set({ isPlaying }),
        setLooping: (isLooping) => set({ isLooping }),
        setRecording: (isRecording) => set({ isRecording }),
        setQuantize: (quantize) => set({ quantize }),
        setRecordMode: (recordMode) => set({ recordMode }),
        setChordSymbol: (bar, symbol, options = { history: false }) =>
          set((state) =>
            apply(
              state,
              {
                ...state.project,
                chords: [
                  ...state.project.chords.filter((slot) => slot.bar !== bar),
                  { bar, symbol, source: "human" as const },
                ].sort((a, b) => a.bar - b.bar),
              },
              options,
            ),
          ),
        removeNotes: (ids) =>
          set((state) => {
            const remove = new Set(ids);
            return apply(state, {
              ...state.project,
              notes: state.project.notes.filter((note) => !remove.has(note.id)),
            });
          }),
        setMidiStatus: (midiSupported, midiDevice) => set({ midiSupported, midiDevice }),
        completeOnboarding: (index) =>
          set((state) => ({
            onboarding: state.onboarding.map((done, i) => (i === index ? true : done)) as [
              boolean,
              boolean,
              boolean,
            ],
          })),
        resetOnboarding: () => set({ onboarding: [false, false, false], guideDismissed: false }),
        dismissGuide: () => set({ guideDismissed: true }),
        setAnnouncement: (announcement) => set({ announcement }),
      };
    },
    {
      name: "duet:v1",
      version: 2,
      storage: createJSONStorage(() => safeStorage),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<ProjectState>;
        if (version < 2) return { ...state, onboarding: [false, false, false], guideDismissed: false };
        return state;
      },
      partialize: (state) => ({
        project: state.project,
        selection: state.selection,
        changeLog: state.changeLog,
        stateVersion: state.stateVersion,
        locale: state.locale,
        onboarding: state.onboarding,
        guideDismissed: state.guideDismissed,
        quantize: state.quantize,
        recordMode: state.recordMode,
        activeTrack: state.activeTrack,
      }),
    },
  ),
);

export const projectStore = useProjectStore;
export const validTrackIds: TrackId[] = TRACK_IDS;
export const clampBar = (bar: number) => Math.max(0, Math.min(PROJECT_BARS, Math.floor(bar)));
