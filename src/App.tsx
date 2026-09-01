import { Bot, Eraser, MousePointer2, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  playProject,
  releasePreviewNotes,
  startPreviewNote,
  stopPlayback,
  stopPreviewNote,
  unlockAudio,
} from "./audio/player";
import { ChangeLog } from "./components/ChangeLog";
import { ChordTrack } from "./components/ChordTrack";
import { Header } from "./components/Header";
import { Onboarding } from "./components/Onboarding";
import { PianoRoll } from "./components/PianoRoll";
import { Transport } from "./components/Transport";
import { t } from "./i18n";
import { connectMidi, disconnectMidi } from "./midi/input";
import { quantizeTick } from "./music/theory";
import { useProjectStore } from "./store/projectStore";
import { TICKS_PER_BEAT, type TrackId } from "./types";
import { registerWebMCPTools } from "./webmcp/registerTools";

const COMPUTER_KEYS: Record<string, number> = { a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72, l: 74 };

function App() {
  const state = useProjectStore(); const { selection, locale, activeTrack, editorMode, setActiveTrack, setEditorMode } = state;
  const [siteToolsReady, setSiteToolsReady] = useState(false); const [soundReady, setSoundReady] = useState(false);
  const openMidiNotes = useRef(new Map<string, { timestamp: number; velocity: number; trackId: TrackId }>());
  const activeComputerNotes = useRef(new Map<string, { pitch: number; trackId: TrackId }>());
  const recordStart = useRef(0); const recordedIds = useRef<string[]>([]); const keyboardCursor = useRef(0);

  useEffect(() => { let cleanup: () => void = () => {}; void registerWebMCPTools().then((result) => { setSiteToolsReady(result.supported); cleanup = result.cleanup; }); return () => cleanup(); }, []);
  useEffect(() => () => { stopPlayback(); disconnectMidi(); }, []);

  const enableSound = useCallback(async () => setSoundReady(await unlockAudio()), []);
  const releaseComputerNotes = useCallback(() => {
    activeComputerNotes.current.clear();
    releasePreviewNotes();
  }, []);
  const handlePlay = useCallback(async () => { if (!soundReady) await enableSound(); const current = useProjectStore.getState(); const range = current.selection ?? { startBar: 0, endBar: current.project.barCount }; if (playProject(current.project, range.startBar, range.endBar, current.isLooping)) current.setPlaying(true); }, [enableSound, soundReady]);
  const handleStop = useCallback(() => { activeComputerNotes.current.clear(); stopPlayback(); useProjectStore.getState().setPlaying(false); }, []);
  const stopRecording = useCallback(() => { const current = useProjectStore.getState(); recordedIds.current.forEach((id) => { const note = current.project.notes.find((item) => item.id === id); if (note) current.updateHumanNote(id, { startTick: quantizeTick(note.startTick, current.quantize), durationTicks: Math.max(30, quantizeTick(note.durationTicks, current.quantize)) }); }); recordedIds.current = []; openMidiNotes.current.clear(); releasePreviewNotes(); current.setRecording(false); }, []);
  const handleRecord = useCallback(async () => { const current = useProjectStore.getState(); if (current.isRecording) { stopRecording(); return; } await enableSound(); recordStart.current = performance.now(); recordedIds.current = []; current.setRecording(true); }, [enableSound, stopRecording]);

  const handleConnectMidi = useCallback(async () => {
    try { await connectMidi({
      onStatus: (device, supported) => useProjectStore.getState().setMidiStatus(supported, device),
      onNoteOn: (pitch, velocity, timestamp, channel) => {
        const trackId = useProjectStore.getState().activeTrack;
        const key = `${channel}:${pitch}`;
        openMidiNotes.current.set(key, { timestamp, velocity, trackId });
        void startPreviewNote({ pitch, velocity, trackId }).then(() => {
          if (!openMidiNotes.current.has(key)) stopPreviewNote({ pitch, trackId });
        });
      },
      onNoteOff: (pitch, timestamp, channel) => {
        const key = `${channel}:${pitch}`; const opened = openMidiNotes.current.get(key); openMidiNotes.current.delete(key);
        if (opened) stopPreviewNote({ pitch, trackId: opened.trackId });
        const current = useProjectStore.getState(); if (!opened || !current.isRecording) return;
        const offset = (current.selection?.startBar ?? 0) * 4 * TICKS_PER_BEAT;
        const startTick = offset + Math.max(0, ((opened.timestamp - recordStart.current) / 60000) * current.project.tempo * TICKS_PER_BEAT);
        const durationTicks = Math.max(30, ((timestamp - opened.timestamp) / 60000) * current.project.tempo * TICKS_PER_BEAT);
        const id = current.addHumanNote({ trackId: opened.trackId, pitch, startTick: Math.round(startTick), durationTicks: Math.round(durationTicks), velocity: opened.velocity }); recordedIds.current.push(id);
      },
    }); } catch { useProjectStore.getState().setMidiStatus(true, null); useProjectStore.getState().setAnnouncement(t(locale, "midiUnavailable")); }
  }, [locale]);

  useEffect(() => {
    const isTypingTarget = (target: EventTarget | null) => ["INPUT", "SELECT", "TEXTAREA"].includes((target as HTMLElement)?.tagName);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || isTypingTarget(event.target)) return;
      if (event.code === "Space") { event.preventDefault(); void handlePlay(); return; }
      const key = event.key.toLowerCase(); const pitch = COMPUTER_KEYS[key];
      if (pitch === undefined || activeComputerNotes.current.has(key)) return;
      event.preventDefault();
      const current = useProjectStore.getState(); const trackId = current.activeTrack;
      activeComputerNotes.current.set(key, { pitch, trackId });
      void startPreviewNote({ pitch, velocity: 86, trackId }).then(() => {
        if (!activeComputerNotes.current.has(key)) stopPreviewNote({ pitch, trackId });
      });
      const base = (current.selection?.startBar ?? 0) * 4 * TICKS_PER_BEAT;
      current.addHumanNote({ trackId, pitch, startTick: base + keyboardCursor.current, durationTicks: TICKS_PER_BEAT / 2, velocity: 86 });
      keyboardCursor.current = (keyboardCursor.current + TICKS_PER_BEAT / 2) % (4 * TICKS_PER_BEAT);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase(); const opened = activeComputerNotes.current.get(key);
      if (!opened) return;
      event.preventDefault(); activeComputerNotes.current.delete(key); stopPreviewNote(opened);
    };
    const onVisibilityChange = () => { if (document.hidden) releaseComputerNotes(); };
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("blur", releaseComputerNotes); document.addEventListener("visibilitychange", onVisibilityChange);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", releaseComputerNotes); document.removeEventListener("visibilitychange", onVisibilityChange); releaseComputerNotes(); };
  }, [handlePlay, releaseComputerNotes]);

  const tools = [{ id: "draw" as const, icon: Pencil, label: t(locale, "draw") }, { id: "select" as const, icon: MousePointer2, label: t(locale, "select") }, { id: "erase" as const, icon: Eraser, label: t(locale, "erase") }]; const tracks = ["melody", "bass", "chords"] as const;
  return <main className="app-shell"><Header siteToolsReady={siteToolsReady} onConnectMidi={handleConnectMidi} onHelp={() => state.resetOnboarding()} /><Onboarding /><div className="workspace"><section className="editor-panel"><div className="editor-toolbar"><div className="segmented">{tools.map(({ id, icon: Icon, label }) => <button key={id} className={editorMode === id ? "active" : ""} onClick={() => setEditorMode(id)}><Icon size={14} />{label}</button>)}</div><div className="track-tabs">{tracks.map((track) => <button key={track} className={activeTrack === track ? "active" : ""} onClick={() => setActiveTrack(track)}>{t(locale, track)}</button>)}</div><div className="legend"><span><i className="human-dot" />{t(locale, "you")}</span><span><i className="agent-dot" />{t(locale, "ai")}</span></div></div><div className="selection-summary"><span>{selection ? `${t(locale, "selected")}: ${t(locale, selection.trackId)} · ${selection.startBar + 1}–${selection.endBar}` : t(locale, "noSelection")}</span><span className="keyboard-hint">A S D F G H J K L</span></div><div className="editor-scroll"><div className="editor-content"><ChordTrack /><PianoRoll /></div></div><Transport soundReady={soundReady} onEnableSound={enableSound} onPlay={handlePlay} onStop={handleStop} onRecord={handleRecord} /></section><ChangeLog /></div><div className="sr-only" aria-live="polite">{state.announcement}</div><div className="mobile-agent-badge"><Bot size={14} />{state.changeLog.length}</div></main>;
}

export default App;
