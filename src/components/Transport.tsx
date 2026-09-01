import { Circle, Download, Play, RotateCcw, Square, Volume2 } from "lucide-react";
import { t } from "../i18n";
import { exportProjectMidi } from "../midi/export";
import { useProjectStore } from "../store/projectStore";

interface TransportProps { soundReady: boolean; onEnableSound: () => void; onPlay: () => void; onStop: () => void; onRecord: () => void; }
export function Transport({ soundReady, onEnableSound, onPlay, onStop, onRecord }: TransportProps) {
  const { project, locale, changeLog, undoChange, isPlaying, isLooping, setLooping, isRecording, quantize, setQuantize } = useProjectStore();
  return <footer className="transport-bar">
    {!soundReady ? <button className="primary-button sound-button" onClick={onEnableSound}><Volume2 size={17}/>{t(locale,"enableSound")}</button> : <button className="primary-button" onClick={isPlaying?onStop:onPlay}>{isPlaying?<Square size={15} fill="currentColor"/>:<Play size={17} fill="currentColor"/>}{isPlaying?t(locale,"stop"):t(locale,"play")}</button>}
    <button className={`transport-button ${isLooping?"transport-active":""}`} onClick={()=>setLooping(!isLooping)}>{t(locale,"loop")}</button>
    <button className={`transport-button record-button ${isRecording?"recording":""}`} onClick={onRecord}><Circle size={10} fill="currentColor"/>{isRecording?t(locale,"recording"):t(locale,"record")}</button>
    <label className="quantize-control"><span>{t(locale,"quantize")}</span><select value={quantize} onChange={(event)=>setQuantize(Number(event.target.value) as 8|16)}><option value={16}>1/16</option><option value={8}>1/8</option></select></label><div className="transport-spacer"/>
    <button className="transport-button" onClick={()=>exportProjectMidi(project)}><Download size={15}/>{t(locale,"exportMidi")}</button>
    <button className="transport-button" disabled={!changeLog.length} onClick={()=>changeLog[0]&&undoChange(changeLog[0].id)}><RotateCcw size={15}/>{t(locale,"undoAi")}</button>
  </footer>;
}
