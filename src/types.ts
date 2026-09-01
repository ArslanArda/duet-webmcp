export const TICKS_PER_BEAT = 480;
export const BEATS_PER_BAR = 4;
export const TICKS_PER_BAR = TICKS_PER_BEAT * BEATS_PER_BAR;
export const PROJECT_BARS = 16;

export type NoteSource = "human" | "agent";
export type TrackId = "melody" | "bass" | "chords";
export type EditorMode = "draw" | "select" | "erase";
export type Locale = "en" | "tr";

export interface Note {
  id: string;
  trackId: TrackId;
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
  source: NoteSource;
  changeId?: string;
}

export interface ChordSlot {
  bar: number;
  symbol: string;
  source: NoteSource;
  changeId?: string;
}

export interface Selection {
  trackId: TrackId;
  startBar: number;
  endBar: number;
}

export interface Project {
  tempo: number;
  keyCenter: string;
  mode: string;
  barCount: number;
  notes: Note[];
  chords: ChordSlot[];
}

export interface InversePatch {
  removeNoteIds: string[];
  restoreNotes: Note[];
  affectedChordBars: number[];
  restoreChords: ChordSlot[];
  previousTempo?: number;
  previousKeyCenter?: string;
  previousMode?: string;
}

export interface Change {
  id: string;
  toolName: string;
  summary: string;
  explanation: string;
  affectedBars: { startBar: number; endBar: number };
  notesAdded: number;
  notesRemoved: number;
  inversePatch: InversePatch;
  timestamp: number;
}

export interface AgentChangeInput {
  id: string;
  toolName: string;
  summary: string;
  explanation: string;
  affectedBars: { startBar: number; endBar: number };
  nextProject: Project;
}

export interface ToolSuccess {
  ok: true;
  stateVersion: number;
  changeId: string;
  summary: string;
  explanation: string;
  affectedBars: { startBar: number; endBar: number };
  notesAdded: number;
  notesRemoved: number;
}

export interface ToolFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    hint: string;
    retryable: boolean;
  };
}

export type ToolResult = ToolSuccess | ToolFailure | Record<string, unknown>;
