import { Bot, Eraser, MousePointer2, Pencil } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { playProject, previewNote, stopPlayback, unlockAudio } from "./audio/player";
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
import { TICKS_PER_BEAT } from "./types";
import { registerWebMCPTools } from "./webmcp/registerTools";

const COMPUTER_KEYS: Record<string, number> = { a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72, l: 74 };

function App() {
  const state = useProjectStore(); const { selection, locale, activeTrack, editorMode, setActiveTrack, setEditorMode } = state;
  const [siteToolsReady, setSiteToolsReady] = useState(false); const [soundReady, setSoundReady] = useState(false);
  const openMidiNotes = useRef(new Map<string, { timestamp: number; velocity: number }>()); const recordStart = useRef(0); const recordedIds = useRef<string[]>([]); const keyboardCursor = useRef(0);
  useEffect(() => { let cleanup: () => void = () => {}; void registerWebMCPTools().then((result) => { setSiteToolsReady(result.supported); cleanup = result.cleanup; }); return () => cleanup(); }, []);
  useEffect(() => () => { stopPlayback(); disconnectMidi(); }, []);
  const enableSound = useCallback(async () => setSoundReady(await unlockAudio()), []);
  const handlePlay = useCallback(async () => { if (!soundReady) await enableSound(); const current = useProjectStore.getState(); const range = current.selection ?? { startBar: 0, endBar: current.project.barCount }; if (playProject(current.project, range.startBar, range.endBar, current.isLooping)) current.setPlaying(true); }, [enableSound, soundReady]);
  const handleStop = useCallback(() => { stopPlayback(); useProjectStore.getState().setPlaying(false); }, []);
  const stopRecording = useCallback(() => { const current = useProjectStore.getState(); recordedIds.current.forEach((id) => { const note = current.project.notes.find((item) => item.id === id); if (note) current.updateHumanNote(id, { startTick: quantizeTick(note.startTick, current.quantize), durationTicks: Math.max(30, quantizeTick(note.durationTicks, current.quantize)) }); }); recordedIds.current = []; openMidiNotes.current.clear(); current.setRecording(false); }, []);
  const handleRecord = useCallback(async () => { const current = useProjectStore.getState(); if (current.isRecording) { stopRecording(); return; } await enableSound(); recordStart.current = performance.now(); recordedIds.current = []; current.setRecording(true); }, [enableSound, stopRecording]);
  const handleConnectMidi = useCallback(async () => {
    try { await connectMidi({
      onStatus: (device, supported) => useProjectStore.getState().setMidiStatus(supported, device),
      onNoteOn: (pitch, velocity, timestamp, channel) => { openMidiNotes.current.set(`${channel}:${pitch}`, { timestamp, velocity }); void previewNote({ pitch, velocity, trackId: useProjectStore.getState().activeTrack }); },
      onNoteOff: (pitch, timestamp, channel) => { const key=`${channel}:${pitch}`;const opened=openMidiNotes.current.get(key);openMidiNotes.current.delete(key);const current=useProjectStore.getState();if(!opened||!current.isRecording)return;const offset=(current.selection?.startBar??0)*4*TICKS_PER_BEAT;const startTick=offset+Math.max(0,((opened.timestamp-recordStart.current)/60000)*current.project.tempo*TICKS_PER_BEAT);const durationTicks=Math.max(30,((timestamp-opened.timestamp)/60000)*current.project.tempo*TICKS_PER_BEAT);const id=current.addHumanNote({trackId:current.activeTrack,pitch,startTick:Math.round(startTick),durationTicks:Math.round(durationTicks),velocity:opened.velocity});recordedIds.current.push(id);},
    }); } catch { useProjectStore.getState().setMidiStatus(true,null);useProjectStore.getState().setAnnouncement(t(locale,"midiUnavailable")); }
  }, [locale]);
  useEffect(() => { const onKeyDown=(event:KeyboardEvent)=>{if(event.repeat||event.metaKey||event.ctrlKey||event.altKey||["INPUT","SELECT","TEXTAREA"].includes((event.target as HTMLElement)?.tagName))return;if(event.code==="Space"){event.preventDefault();void handlePlay();return;}const pitch=COMPUTER_KEYS[event.key.toLowerCase()];if(pitch===undefined)return;event.preventDefault();void previewNote({pitch,velocity:86,trackId:useProjectStore.getState().activeTrack});const current=useProjectStore.getState();const base=(current.selection?.startBar??0)*4*TICKS_PER_BEAT;current.addHumanNote({trackId:current.activeTrack,pitch,startTick:base+keyboardCursor.current,durationTicks:TICKS_PER_BEAT/2,velocity:86});keyboardCursor.current=(keyboardCursor.current+TICKS_PER_BEAT/2)%(4*TICKS_PER_BEAT);};window.addEventListener("keydown",onKeyDown);return()=>window.removeEventListener("keydown",onKeyDown);},[handlePlay]);
  const tools=[{id:"draw" as const,icon:Pencil,label:t(locale,"draw")},{id:"select" as const,icon:MousePointer2,label:t(locale,"select")},{id:"erase" as const,icon:Eraser,label:t(locale,"erase")}];const tracks=["melody","bass","chords"] as const;
  return <main className="app-shell"><Header siteToolsReady={siteToolsReady} onConnectMidi={handleConnectMidi} onHelp={()=>state.resetOnboarding()}/><Onboarding/><div className="workspace"><section className="editor-panel"><div className="editor-toolbar"><div className="segmented">{tools.map(({id,icon:Icon,label})=><button key={id} className={editorMode===id?"active":""} onClick={()=>setEditorMode(id)}><Icon size={14}/>{label}</button>)}</div><div className="track-tabs">{tracks.map((track)=><button key={track} className={activeTrack===track?"active":""} onClick={()=>setActiveTrack(track)}>{t(locale,track)}</button>)}</div><div className="legend"><span><i className="human-dot"/>{t(locale,"you")}</span><span><i className="agent-dot"/>{t(locale,"ai")}</span></div></div><div className="selection-summary"><span>{selection?`${t(locale,"selected")}: ${t(locale,selection.trackId)} · ${selection.startBar+1}–${selection.endBar}`:t(locale,"noSelection")}</span><span className="keyboard-hint">A S D F G H J K L</span></div><div className="editor-scroll"><div className="editor-content"><ChordTrack/><PianoRoll/></div></div><Transport soundReady={soundReady} onEnableSound={enableSound} onPlay={handlePlay} onStop={handleStop} onRecord={handleRecord}/></section><ChangeLog/></div><div className="sr-only" aria-live="polite">{state.announcement}</div><div className="mobile-agent-badge"><Bot size={14}/>{state.changeLog.length}</div></main>;
}
export default App;
