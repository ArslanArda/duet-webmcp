import { Bot, Check, Music4, Trash2, X } from "lucide-react";
import { t } from "../i18n";
import { useLiveInput } from "../input/liveInput";
import { useProjectStore } from "../store/projectStore";
import type { Quantize } from "../types";

interface TakeCardProps {
  onRequantize: (quantize: Quantize) => void;
  onDelete: () => void;
  onAskAi: (prompt: string) => void;
}

/** Shown after a recording stops: what landed, and three quick ways to react. */
export function TakeCard({ onRequantize, onDelete, onAskAi }: TakeCardProps) {
  const { locale, isRecording } = useProjectStore();
  const take = useLiveInput((state) => state.lastTake);
  const dismiss = useLiveInput((state) => state.setLastTake);
  if (!take || isRecording) return null;
  const track = t(locale, take.trackId);
  return (
    <div className="take-card" role="status">
      <span className="take-icon">
        <Music4 size={15} />
      </span>
      <span className="take-text">
        <b>
          {t(locale, "takeRecorded", {
            count: take.ids.length,
            track,
            start: take.startBar + 1,
            end: take.endBar,
          })}
        </b>
        {take.chordsDetected ? (
          <small>{t(locale, "takeChords", { count: take.chordsDetected })}</small>
        ) : null}
      </span>
      <span className="take-actions">
        {([16, 8] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={`chip ${take.quantize === value ? "active" : ""}`}
            onClick={() => onRequantize(value)}
          >
            {take.quantize === value ? <Check size={12} /> : null}
            {t(locale, value === 16 ? "takeTight" : "takeLoose")}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() =>
            onAskAi(t(locale, "promptFixTake", { track, start: take.startBar + 1, end: take.endBar }))
          }
        >
          <Bot size={12} /> {t(locale, "takeAskAi")}
        </button>
        <button type="button" className="chip danger" onClick={onDelete}>
          <Trash2 size={12} /> {t(locale, "takeDelete")}
        </button>
      </span>
      <button
        type="button"
        className="icon-button ghost"
        aria-label={t(locale, "close")}
        onClick={() => dismiss(null)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
