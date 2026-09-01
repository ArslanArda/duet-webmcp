import { Plus } from "lucide-react";
import { useState } from "react";
import { t } from "../i18n";
import { describeChord, prettySymbol } from "../music/chordCatalog";
import { useProjectStore } from "../store/projectStore";
import { PROJECT_BARS } from "../types";
import { ChordPicker } from "./ChordPicker";
import { useEditorLayout } from "./editorLayout";

export function ChordStrip() {
  const { barWidth, gridWidth } = useEditorLayout();
  const { project, locale, editorMode, selection, selectionSource, activeTrack, clearHumanChord } =
    useProjectStore();
  const [editing, setEditing] = useState<{ bar: number; anchor: DOMRect } | null>(null);

  return (
    <div className="chord-strip" style={{ width: gridWidth }}>
      {Array.from({ length: PROJECT_BARS }, (_, bar) => {
        const slot = project.chords.find((item) => item.bar === bar);
        const info = slot ? describeChord(slot.symbol, locale) : null;
        const inSelection = selection ? bar >= selection.startBar && bar < selection.endBar : false;
        const classes = [
          "chord-cell",
          inSelection ? "selected" : "",
          inSelection && activeTrack === "chords" ? "selected-strong" : "",
          inSelection && selectionSource === "agent" ? "agent-selected" : "",
          slot?.source === "agent" ? "agent" : "",
          editing?.bar === bar ? "editing" : "",
        ].join(" ");
        return (
          <button
            type="button"
            key={bar}
            className={classes}
            style={{ width: barWidth }}
            title={
              slot
                ? `${prettySymbol(slot.symbol)}${info ? ` · ${info.label}${info.mood ? ` · ${info.mood}` : ""}` : ""}`
                : t(locale, "addChord")
            }
            aria-label={`${t(locale, "chordPickerTitle", { bar: bar + 1 })}: ${slot ? prettySymbol(slot.symbol) : t(locale, "noChord")}`}
            onClick={(event) => {
              if (editorMode === "erase") {
                if (slot) clearHumanChord(bar);
                return;
              }
              setEditing({ bar, anchor: event.currentTarget.getBoundingClientRect() });
            }}
          >
            {slot ? (
              <>
                <b>{prettySymbol(slot.symbol)}</b>
                {barWidth >= 72 ? <small>{info?.label ?? ""}</small> : null}
              </>
            ) : (
              <span className="chord-empty">
                <Plus size={13} />
                {barWidth >= 96 ? <small>{t(locale, "addChord")}</small> : null}
              </span>
            )}
          </button>
        );
      })}
      {editing ? (
        <ChordPicker bar={editing.bar} anchor={editing.anchor} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}
