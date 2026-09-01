import { useCallback, useEffect, useRef } from "react";
import {
  playProject,
  releasePreviewNotes,
  scheduleLoopNote,
  startPreviewNote,
  stopPlayback,
  stopPreviewNote,
  unlockAudio,
} from "../audio/player";
import { t } from "../i18n";
import { midiToPitchName, quantizeTick } from "../music/theory";
import { useProjectStore } from "../store/projectStore";
import { MIN_NOTE_TICKS, TICKS_PER_BAR, type Note, type Quantize, type TrackId } from "../types";
import { liveInput, type Take } from "./liveInput";
import { detectChordSymbol, msToTicks, tickForElapsed } from "./recordingMath";

interface OpenNote {
  pitch: number;
  velocity: number;
  timestamp: number;
  trackId: TrackId;
  startTick: number | null;
}

const CHORD_WINDOW_MS = 120;

/**
 * One path for every live note source (computer keys and MIDI):
 * - outside recording, keys only make sound and light up the key gutter;
 * - Record counts in four beats, plays the range with a click and captures
 *   real timing; with Loop on, the range cycles and every pass layers on top;
 * - on the Chords track, keys pressed together are named as a chord.
 */
export function useRecorder() {
  const openNotes = useRef(new Map<string, OpenNote>());
  const armed = useRef(false);
  const recordStart = useRef(0);
  const range = useRef({ startTick: 0, endTick: 0, loop: false });
  const take = useRef<{ ids: string[]; raw: Take["raw"]; chords: number; trackId: TrackId }>({
    ids: [],
    raw: {},
    chords: 0,
    trackId: "melody",
  });
  const historyPushed = useRef(false);
  const chordBuffer = useRef<{ pitches: number[]; tick: number; timer: number }>({
    pitches: [],
    tick: 0,
    timer: 0,
  });

  const tickNow = useCallback((timestamp: number) => {
    const tempo = useProjectStore.getState().project.tempo;
    const { startTick, endTick, loop } = range.current;
    return tickForElapsed(
      msToTicks(timestamp - recordStart.current, tempo),
      startTick,
      endTick - startTick,
      loop,
    );
  }, []);

  const flushChord = useCallback(() => {
    const buffer = chordBuffer.current;
    const pitches = buffer.pitches;
    buffer.pitches = [];
    buffer.timer = 0;
    const symbol = detectChordSymbol(pitches);
    if (!symbol) return;
    const state = useProjectStore.getState();
    state.setChordSymbol(Math.floor(buffer.tick / TICKS_PER_BAR), symbol);
    take.current.chords += 1;
    state.setAnnouncement(t(state.locale, "chordDetected", { chord: symbol }));
  }, []);

  const stopRecording = useCallback(() => {
    const state = useProjectStore.getState();
    stopPlayback();
    if (chordBuffer.current.timer) {
      clearTimeout(chordBuffer.current.timer);
      flushChord();
    }
    const current = take.current;
    current.ids.forEach((id) => {
      const raw = current.raw[id];
      if (!raw) return;
      state.updateHumanNote(id, {
        startTick: quantizeTick(raw.startTick, state.quantize),
        durationTicks: Math.max(MIN_NOTE_TICKS, quantizeTick(raw.durationTicks, state.quantize)),
      });
    });
    liveInput.getState().setLastTake(
      current.ids.length
        ? {
            ids: current.ids,
            trackId: current.trackId,
            startBar: range.current.startTick / TICKS_PER_BAR,
            endBar: range.current.endTick / TICKS_PER_BAR,
            quantize: state.quantize,
            raw: current.raw,
            chordsDetected: current.chords,
          }
        : null,
    );
    take.current = { ids: [], raw: {}, chords: 0, trackId: state.activeTrack };
    openNotes.current.clear();
    armed.current = false;
    releasePreviewNotes();
    liveInput.getState().clearHeld();
    liveInput.getState().setCountIn(null);
    liveInput.getState().setRecording(null);
    state.setRecording(false);
    state.setPlaying(false);
  }, [flushChord]);

  const startRecording = useCallback(async () => {
    if (!(await unlockAudio())) return false;
    const state = useProjectStore.getState();
    const bars = state.selection ?? { startBar: 0, endBar: state.project.barCount };
    const loop = state.isLooping;
    range.current = { startTick: bars.startBar * TICKS_PER_BAR, endTick: bars.endBar * TICKS_PER_BAR, loop };
    take.current = { ids: [], raw: {}, chords: 0, trackId: state.activeTrack };
    historyPushed.current = false;
    armed.current = false;
    liveInput.getState().setLastTake(null);
    if (state.recordMode === "replace") {
      state.deleteInRange({ trackId: state.activeTrack, startBar: bars.startBar, endBar: bars.endBar });
      historyPushed.current = true;
    }
    const live = liveInput.getState();
    const started = playProject(useProjectStore.getState().project, bars.startBar, bars.endBar, {
      loop,
      countInBeats: 4,
      metronome: true,
      onCountInBeat: (remaining) => live.setCountIn(remaining),
      onRangeStart: () => {
        recordStart.current = performance.now();
        armed.current = true;
        live.setCountIn(null);
      },
      onEnded: loop ? undefined : () => stopRecording(),
    });
    if (!started) return false;
    live.setRecording(range.current);
    state.setRecording(true);
    state.setPlaying(true);
    return true;
  }, [stopRecording]);

  const toggleRecording = useCallback(async () => {
    if (useProjectStore.getState().isRecording) stopRecording();
    else await startRecording();
  }, [startRecording, stopRecording]);

  const noteOn = useCallback(
    (key: string, pitch: number, velocity: number, timestamp: number) => {
      if (openNotes.current.has(key)) return;
      const state = useProjectStore.getState();
      const trackId = state.activeTrack;
      const recording = state.isRecording && armed.current;
      const startTick = recording ? Math.round(tickNow(timestamp)) : null;
      openNotes.current.set(key, { pitch, velocity, timestamp, trackId, startTick });
      liveInput.getState().hold({ key, pitch, velocity, trackId, startTick });
      void startPreviewNote({ pitch, velocity, trackId }).then(() => {
        if (!openNotes.current.has(key)) stopPreviewNote({ pitch, trackId });
      });
      if (recording && trackId === "chords" && startTick !== null) {
        const buffer = chordBuffer.current;
        if (!buffer.pitches.length) buffer.tick = startTick;
        buffer.pitches.push(pitch);
        if (buffer.timer) clearTimeout(buffer.timer);
        buffer.timer = window.setTimeout(flushChord, CHORD_WINDOW_MS);
      }
    },
    [flushChord, tickNow],
  );

  const noteOff = useCallback((key: string, timestamp: number) => {
    const opened = openNotes.current.get(key);
    if (!opened) return;
    openNotes.current.delete(key);
    liveInput.getState().release(key);
    stopPreviewNote(opened);
    const state = useProjectStore.getState();
    if (!state.isRecording || opened.startTick === null) return;
    const { endTick } = range.current;
    if (opened.startTick >= endTick) return;
    const durationTicks = Math.round(
      Math.min(
        endTick - opened.startTick,
        Math.max(MIN_NOTE_TICKS, msToTicks(timestamp - opened.timestamp, state.project.tempo)),
      ),
    );
    const draft = {
      trackId: opened.trackId,
      pitch: opened.pitch,
      startTick: opened.startTick,
      durationTicks,
      velocity: opened.velocity,
    };
    const id = state.addHumanNote(draft, { history: !historyPushed.current });
    historyPushed.current = true;
    take.current.ids.push(id);
    take.current.raw[id] = { startTick: draft.startTick, durationTicks };
    if (range.current.loop) scheduleLoopNote({ ...draft, id, source: "human" } as Note);
    state.setAnnouncement(
      t(state.locale, "noteAdded", {
        note: midiToPitchName(draft.pitch),
        bar: Math.floor(draft.startTick / TICKS_PER_BAR) + 1,
      }),
    );
  }, []);

  const requantizeTake = useCallback((quantize: Quantize) => {
    const lastTake = liveInput.getState().lastTake;
    if (!lastTake) return;
    const state = useProjectStore.getState();
    state.snapshot();
    lastTake.ids.forEach((id) => {
      const raw = lastTake.raw[id];
      if (raw)
        state.updateHumanNote(id, {
          startTick: quantizeTick(raw.startTick, quantize),
          durationTicks: Math.max(MIN_NOTE_TICKS, quantizeTick(raw.durationTicks, quantize)),
        });
    });
    liveInput.getState().setLastTake({ ...lastTake, quantize });
  }, []);

  const deleteTake = useCallback(() => {
    const lastTake = liveInput.getState().lastTake;
    if (!lastTake) return;
    useProjectStore.getState().removeNotes(lastTake.ids);
    liveInput.getState().setLastTake(null);
  }, []);

  const releaseAll = useCallback(() => {
    openNotes.current.clear();
    liveInput.getState().clearHeld();
    releasePreviewNotes();
  }, []);

  useEffect(() => () => releaseAll(), [releaseAll]);

  return { noteOn, noteOff, releaseAll, toggleRecording, stopRecording, requantizeTake, deleteTake };
}
