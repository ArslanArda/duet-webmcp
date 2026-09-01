import { create } from "zustand";
import type { Quantize, TrackId } from "../types";

/**
 * Transient state for what the person is playing right now: held keys,
 * the on-screen count-in, MIDI activity and the last recorded take.
 * Not persisted; it changes too often to live in the project store.
 */
export interface HeldNote {
  key: string;
  pitch: number;
  velocity: number;
  trackId: TrackId;
  /** Set while recording so the grid can draw the note growing from here. */
  startTick: number | null;
}

export interface Take {
  ids: string[];
  trackId: TrackId;
  startBar: number;
  endBar: number;
  quantize: Quantize;
  raw: Record<string, { startTick: number; durationTicks: number }>;
  chordsDetected: number;
}

export interface RecordingRange {
  startTick: number;
  endTick: number;
  loop: boolean;
}

interface LiveInputState {
  held: HeldNote[];
  countIn: number | null;
  midiPulse: number;
  recording: RecordingRange | null;
  lastTake: Take | null;
  hold: (note: HeldNote) => void;
  release: (key: string) => void;
  clearHeld: () => void;
  setCountIn: (value: number | null) => void;
  pulse: () => void;
  setRecording: (range: RecordingRange | null) => void;
  setLastTake: (take: Take | null) => void;
}

export const useLiveInput = create<LiveInputState>()((set) => ({
  held: [],
  countIn: null,
  midiPulse: 0,
  recording: null,
  lastTake: null,
  hold: (note) => set((state) => ({ held: [...state.held.filter((item) => item.key !== note.key), note] })),
  release: (key) => set((state) => ({ held: state.held.filter((item) => item.key !== key) })),
  clearHeld: () => set({ held: [] }),
  setCountIn: (countIn) => set({ countIn }),
  pulse: () => set((state) => ({ midiPulse: state.midiPulse + 1 })),
  setRecording: (recording) => set({ recording }),
  setLastTake: (lastTake) => set({ lastTake }),
}));

export const liveInput = useLiveInput;
