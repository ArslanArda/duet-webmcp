import { useCallback, useEffect, useRef } from "react";
import {
  playProject,
  releasePreviewNotes,
  startPreviewNote,
  stopPlayback,
  stopPreviewNote,
  unlockAudio,
} from "../audio/player";
import { quantizeTick } from "../music/theory";
import { useProjectStore } from "../store/projectStore";
import { MIN_NOTE_TICKS, TICKS_PER_BAR, TICKS_PER_BEAT, type TrackId } from "../types";

interface OpenNote {
  pitch: number;
  velocity: number;
  timestamp: number;
  trackId: TrackId;
}

/**
 * One path for every live note source (computer keys and MIDI):
 * - outside recording, keys only make sound;
 * - while recording, the range plays with a click track after a 4-beat
 *   count-in, and released notes land at their real time, quantized on stop.
 */
export function useRecorder() {
  const openNotes = useRef(new Map<string, OpenNote>());
  const armed = useRef(false);
  const recordStart = useRef(0);
  const rangeStartTick = useRef(0);
  const recordedIds = useRef<string[]>([]);

  const stopRecording = useCallback(() => {
    const state = useProjectStore.getState();
    stopPlayback();
    recordedIds.current.forEach((id) => {
      const note = state.project.notes.find((item) => item.id === id);
      if (!note) return;
      state.updateHumanNote(id, {
        startTick: quantizeTick(note.startTick, state.quantize),
        durationTicks: Math.max(MIN_NOTE_TICKS, quantizeTick(note.durationTicks, state.quantize)),
      });
    });
    recordedIds.current = [];
    openNotes.current.clear();
    armed.current = false;
    releasePreviewNotes();
    state.setRecording(false);
    state.setPlaying(false);
  }, []);

  const startRecording = useCallback(async () => {
    if (!(await unlockAudio())) return false;
    const state = useProjectStore.getState();
    const range = state.selection ?? { startBar: 0, endBar: state.project.barCount };
    rangeStartTick.current = range.startBar * TICKS_PER_BAR;
    recordedIds.current = [];
    armed.current = false;
    const started = playProject(state.project, range.startBar, range.endBar, {
      countInBeats: 4,
      metronome: true,
      onRangeStart: () => {
        recordStart.current = performance.now();
        armed.current = true;
      },
      onEnded: () => stopRecording(),
    });
    if (!started) return false;
    state.setRecording(true);
    state.setPlaying(true);
    return true;
  }, [stopRecording]);

  const toggleRecording = useCallback(async () => {
    if (useProjectStore.getState().isRecording) stopRecording();
    else await startRecording();
  }, [startRecording, stopRecording]);

  const noteOn = useCallback((key: string, pitch: number, velocity: number, timestamp: number) => {
    if (openNotes.current.has(key)) return;
    const trackId = useProjectStore.getState().activeTrack;
    openNotes.current.set(key, { pitch, velocity, timestamp, trackId });
    void startPreviewNote({ pitch, velocity, trackId }).then(() => {
      if (!openNotes.current.has(key)) stopPreviewNote({ pitch, trackId });
    });
  }, []);

  const noteOff = useCallback((key: string, timestamp: number) => {
    const opened = openNotes.current.get(key);
    if (!opened) return;
    openNotes.current.delete(key);
    stopPreviewNote(opened);
    const state = useProjectStore.getState();
    if (!state.isRecording || !armed.current || opened.timestamp < recordStart.current) return;
    const toTicks = (ms: number) => (ms / 60000) * state.project.tempo * TICKS_PER_BEAT;
    const startTick = rangeStartTick.current + toTicks(opened.timestamp - recordStart.current);
    if (startTick >= state.project.barCount * TICKS_PER_BAR) return;
    const id = state.addHumanNote(
      {
        trackId: opened.trackId,
        pitch: opened.pitch,
        startTick: Math.round(startTick),
        durationTicks: Math.round(Math.max(MIN_NOTE_TICKS, toTicks(timestamp - opened.timestamp))),
        velocity: opened.velocity,
      },
      { history: recordedIds.current.length === 0 },
    );
    recordedIds.current.push(id);
  }, []);

  const releaseAll = useCallback(() => {
    openNotes.current.clear();
    releasePreviewNotes();
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);

  return { noteOn, noteOff, releaseAll, toggleRecording, stopRecording };
}
