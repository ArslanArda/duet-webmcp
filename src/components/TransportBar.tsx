import {
  Circle,
  Download,
  MoreHorizontal,
  Piano,
  Play,
  Redo2,
  Repeat,
  Square,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { subscribePlayhead } from "../audio/playhead";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { TICKS_PER_BAR, TICKS_PER_BEAT } from "../types";
import { Popover } from "./Popover";

interface TransportBarProps {
  onTogglePlay: () => void;
  onLoopChange: (value: boolean) => void;
  onRecord: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onConnectMidi: () => void;
}

export function TransportBar({
  onTogglePlay,
  onLoopChange,
  onRecord,
  onUndo,
  onRedo,
  onExport,
  onConnectMidi,
}: TransportBarProps) {
  const {
    locale,
    selection,
    isPlaying,
    isLooping,
    isRecording,
    quantize,
    setQuantize,
    past,
    future,
    midiSupported,
    midiDevice,
    deleteInRange,
    activeTrack,
    recordMode,
    setRecordMode,
  } = useProjectStore();
  const [moreOpen, setMoreOpen] = useState(false);
  const clock = useRef<HTMLSpanElement | null>(null);
  const idle = t(locale, "position", { bar: (selection?.startBar ?? 0) + 1, beat: 1 });

  useEffect(
    () =>
      subscribePlayhead((tick) => {
        const node = clock.current;
        if (!node) return;
        if (tick === null) {
          node.textContent = idle;
          return;
        }
        node.textContent = t(locale, "position", {
          bar: Math.floor(tick / TICKS_PER_BAR) + 1,
          beat: Math.floor((tick % TICKS_PER_BAR) / TICKS_PER_BEAT) + 1,
        });
      }),
    [locale, idle],
  );

  const playLabel = isPlaying
    ? t(locale, "stop")
    : selection
      ? t(locale, "playRange", { start: selection.startBar + 1, end: selection.endBar })
      : t(locale, "playAll");

  return (
    <footer className="transport">
      <button
        type="button"
        className={`button primary play-button ${isPlaying ? "playing" : ""}`}
        onClick={onTogglePlay}
        title="Space"
      >
        {isPlaying ? <Square size={15} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
        <span>{playLabel}</span>
      </button>
      <button
        type="button"
        className={`button ${isLooping ? "active" : ""}`}
        aria-pressed={isLooping}
        title={t(locale, "loopHint")}
        onClick={() => onLoopChange(!isLooping)}
      >
        <Repeat size={15} />
        <span>{t(locale, "loop")}</span>
      </button>
      <button
        type="button"
        className={`button record-button ${isRecording ? "recording" : ""}`}
        aria-pressed={isRecording}
        title={t(locale, "recordHint")}
        onClick={onRecord}
      >
        <Circle size={11} fill="currentColor" />
        <span>{isRecording ? t(locale, "recording") : t(locale, "record")}</span>
        <span className="record-target">{t(locale, "recordTarget", { track: t(locale, activeTrack) })}</span>
      </button>

      <span className="divider" />

      <button
        type="button"
        className="button"
        disabled={!past.length}
        onClick={onUndo}
        title={t(locale, "undo")}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="button"
        disabled={!future.length}
        onClick={onRedo}
        title={t(locale, "redo")}
      >
        <Redo2 size={16} />
      </button>
      {selection ? (
        <button
          type="button"
          className="button danger"
          onClick={() => deleteInRange(selection)}
          title="Delete"
        >
          <Trash2 size={15} />
          <span className="hide-sm">{t(locale, "deleteSelected")}</span>
        </button>
      ) : null}

      <span className="spacer" />

      <span className="clock" aria-live="off">
        <span ref={clock}>{idle}</span>
      </span>

      <div className="popover-host">
        <button
          type="button"
          className="button"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((open) => !open)}
          title={t(locale, "more")}
        >
          <MoreHorizontal size={16} />
          <span className="hide-sm">{t(locale, "more")}</span>
        </button>
        <Popover
          open={moreOpen}
          onClose={() => setMoreOpen(false)}
          align="end"
          closeLabel={t(locale, "close")}
          className="more-menu up"
        >
          <p className="field-label">{t(locale, "timing")}</p>
          <div className="chip-grid">
            {([16, 8] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={`chip ${quantize === value ? "active" : ""}`}
                onClick={() => setQuantize(value)}
              >
                {t(locale, value === 16 ? "timingTight" : "timingLoose")}
              </button>
            ))}
          </div>
          <p className="hint">{t(locale, "timingHint")}</p>
          <p className="field-label">{t(locale, "recordMode")}</p>
          <div className="chip-grid">
            {(["layer", "replace"] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={`chip ${recordMode === value ? "active" : ""}`}
                onClick={() => setRecordMode(value)}
              >
                {t(locale, value === "layer" ? "recordLayer" : "recordReplace")}
              </button>
            ))}
          </div>
          <p className="hint">{t(locale, "recordModeHint")}</p>
          <button
            type="button"
            className="menu-item"
            onClick={() => {
              onExport();
              setMoreOpen(false);
            }}
          >
            <Download size={15} />
            <b>{t(locale, "exportMidi")}</b>
          </button>
          {midiSupported ? (
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                onConnectMidi();
                setMoreOpen(false);
              }}
            >
              <Piano size={15} />
              <b>
                {midiDevice ? t(locale, "midiConnected", { device: midiDevice }) : t(locale, "connectMidi")}
              </b>
            </button>
          ) : null}
          <p className="hint">{t(locale, "keyboardHint")}</p>
        </Popover>
      </div>
    </footer>
  );
}
