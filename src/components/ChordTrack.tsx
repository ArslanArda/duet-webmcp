import { nanoid } from "nanoid";
import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";
import { t } from "../i18n";
import { isValidChord } from "../music/theory";
import { voiceChord } from "../music/voicing";
import { useProjectStore } from "../store/projectStore";

export function ChordTrack() {
  const { project, locale, editorMode, setHumanChord, setSelection, activeTrack, completeOnboarding, selection } = useProjectStore();
  const [editing, setEditing] = useState<number | null>(null); const [value, setValue] = useState(""); const [error, setError] = useState(false);
  const openEditor = (bar: number, symbol: string) => { setEditing(bar); setValue(symbol); setError(false); };
  const save = () => {
    if (editing === null || !isValidChord(value)) { setError(true); return; }
    const notes = voiceChord(value, editing).map((draft) => ({ ...draft, id: nanoid(), source: "human" as const }));
    setHumanChord(editing, value, notes); setEditing(null);
  };
  return (
    <div className="chord-track" style={{ gridTemplateColumns: "72px repeat(16, 112px)" }}>
      <div className="track-label sticky-left">{t(locale, "chords")}</div>
      {Array.from({ length: project.barCount }, (_, bar) => {
        const symbol = project.chords.find((slot) => slot.bar === bar)?.symbol ?? "—";
        const selected = activeTrack === "chords" && selection?.startBar === bar;
        return <div className={`chord-cell ${selected ? "chord-selected" : ""}`} key={bar}>
          {editing === bar ? <form onSubmit={(event) => { event.preventDefault(); save(); }}><input autoFocus aria-label={t(locale, "editChord")} value={value} onChange={(event) => { setValue(event.target.value); setError(false); }} className={error ? "input-error" : ""} /><button type="submit" aria-label="Save"><Check size={13} /></button><button type="button" onClick={() => setEditing(null)} aria-label={t(locale, "close")}><X size={13} /></button></form> : <button onClick={() => { if (editorMode === "select") { setSelection({ trackId: "chords", startBar: bar, endBar: bar + 1 }); completeOnboarding(1); } else openEditor(bar, symbol === "—" ? "" : symbol); }} title={t(locale, "editChord")}><span>{bar + 1}</span><b>{symbol}</b><Pencil size={11} /></button>}
        </div>;
      })}
    </div>
  );
}
