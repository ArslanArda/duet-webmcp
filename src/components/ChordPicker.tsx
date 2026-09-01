import { Note as TonalNote } from "@tonaljs/tonal";
import { Trash2, Volume2, X } from "lucide-react";
import { nanoid } from "nanoid";
import { useEffect, useMemo, useRef, useState } from "react";
import { previewPitches } from "../audio/player";
import { t } from "../i18n";
import {
  buildChordSymbol,
  CHORD_QUALITIES,
  describeChord,
  prettySymbol,
  ROOT_LABELS,
  suggestedChords,
} from "../music/chordCatalog";
import { isValidChord } from "../music/theory";
import { chordPitches, voiceChord } from "../music/voicing";
import { useProjectStore } from "../store/projectStore";
import { KEY_CENTERS } from "../types";

interface ChordPickerProps {
  bar: number;
  anchor: DOMRect;
  onClose: () => void;
}

export function ChordPicker({ bar, anchor, onClose }: ChordPickerProps) {
  const { project, locale, setHumanChord, clearHumanChord } = useProjectStore();
  const symbol = project.chords.find((slot) => slot.bar === bar)?.symbol ?? "";
  const description = symbol ? describeChord(symbol, locale) : null;
  const [typed, setTyped] = useState(symbol);
  const [error, setError] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const suggestions = useMemo(
    () => suggestedChords(project.keyCenter, project.mode),
    [project.keyCenter, project.mode],
  );

  useEffect(() => setTyped(symbol), [symbol]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    const onPointer = (event: PointerEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [onClose]);

  const apply = (next: string) => {
    if (!isValidChord(next)) {
      setError(true);
      return;
    }
    const notes = voiceChord(next, bar).map((draft) => ({
      ...draft,
      id: nanoid(),
      source: "human" as const,
    }));
    setHumanChord(bar, next, notes);
    void previewPitches(notes.map((note) => note.pitch));
    setError(false);
  };
  const rootChroma = description ? TonalNote.chroma(description.root) : null;
  const currentRoot = KEY_CENTERS.find((root) => TonalNote.chroma(root) === rootChroma) ?? "C";
  const currentQuality = description?.quality?.id ?? null;

  const width = 400;
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
  const top = Math.min(anchor.bottom + 6, Math.max(8, window.innerHeight - 8 - 520));

  return (
    <div
      ref={panel}
      className="chord-picker"
      role="dialog"
      aria-label={t(locale, "chordPickerTitle", { bar: bar + 1 })}
      style={{ left, top, width }}
    >
      <div className="popover-head">
        <div>
          <h3>{t(locale, "chordPickerTitle", { bar: bar + 1 })}</h3>
          <p>
            {symbol ? (
              <>
                <b>{prettySymbol(symbol)}</b>
                {description
                  ? ` · ${description.label}${description.mood ? ` · ${description.mood}` : ""}`
                  : null}
              </>
            ) : (
              t(locale, "noChord")
            )}
          </p>
        </div>
        <button type="button" className="icon-button ghost" onClick={onClose} aria-label={t(locale, "close")}>
          <X size={16} />
        </button>
      </div>

      <p className="field-label">{t(locale, "fitsKey")}</p>
      <div className="chip-grid suggestions">
        {[...suggestions.triads, ...suggestions.sevenths].map((item) => {
          const info = describeChord(item, locale);
          return (
            <button
              type="button"
              key={item}
              className={`chip ${item === symbol ? "active" : ""}`}
              title={info ? `${info.label}${info.mood ? ` · ${info.mood}` : ""}` : item}
              onClick={() => apply(item)}
            >
              <b>{prettySymbol(item)}</b>
              {info ? <small>{info.label}</small> : null}
            </button>
          );
        })}
      </div>

      <p className="field-label">{t(locale, "rootNote")}</p>
      <div className="chip-grid roots">
        {KEY_CENTERS.map((root) => (
          <button
            type="button"
            key={root}
            className={`chip ${root === currentRoot && symbol ? "active" : ""}`}
            onClick={() => apply(buildChordSymbol(root, currentQuality ?? "major"))}
          >
            {ROOT_LABELS[root]}
          </button>
        ))}
      </div>

      <p className="field-label">{t(locale, "chordType")}</p>
      <div className="option-grid">
        {CHORD_QUALITIES.map((quality) => (
          <button
            type="button"
            key={quality.id}
            className={`option ${quality.id === currentQuality ? "active" : ""}`}
            onClick={() => apply(buildChordSymbol(currentRoot, quality.id))}
          >
            <b>
              {quality.label[locale]}{" "}
              <span className="muted">{prettySymbol(buildChordSymbol(currentRoot, quality.id))}</span>
            </b>
            <small>{quality.mood[locale]}</small>
          </button>
        ))}
      </div>

      <form
        className="symbol-form"
        onSubmit={(event) => {
          event.preventDefault();
          apply(typed.trim());
        }}
      >
        <label>
          <span className="field-label">{t(locale, "typeSymbol")}</span>
          <input
            value={typed}
            onChange={(event) => {
              setTyped(event.target.value);
              setError(false);
            }}
            placeholder="Cmaj7"
            aria-invalid={error}
          />
        </label>
        <button type="submit" className="button">
          {t(locale, "apply")}
        </button>
      </form>
      {error ? <p className="form-error">{t(locale, "invalidChord")}</p> : null}

      <div className="picker-actions">
        <button
          type="button"
          className="button"
          disabled={!symbol}
          onClick={() => void previewPitches(chordPitches(symbol))}
        >
          <Volume2 size={15} /> {t(locale, "listen")}
        </button>
        <button
          type="button"
          className="button danger"
          disabled={!symbol}
          onClick={() => {
            clearHumanChord(bar);
            onClose();
          }}
        >
          <Trash2 size={15} /> {t(locale, "removeChord")}
        </button>
      </div>
    </div>
  );
}
