import { RotateCcw, ScanSearch, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { useActivityStore } from "../webmcp/activity";

const TOAST_MS = 7000;

/** A short, dismissible note over the grid whenever an AI write lands. */
export function AgentToast() {
  const { locale, changeLog, undoChange, setSelection, activeTrack } = useProjectStore();
  const latestWrite = useActivityStore((state) =>
    state.activities.find((item) => item.kind === "write" && item.status === "ok" && item.changeId),
  );
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!latestWrite) return;
    const timer = setTimeout(() => tick((value) => value + 1), TOAST_MS + 50);
    return () => clearTimeout(timer);
  }, [latestWrite]);
  if (!latestWrite || dismissed === latestWrite.id) return null;
  if (Date.now() - (latestWrite.endedAt ?? latestWrite.startedAt) > TOAST_MS) return null;
  const change = changeLog.find((item) => item.id === latestWrite.changeId);
  if (!change) return null;
  return (
    <div className="agent-toast" role="status">
      <Sparkles size={15} className="agent-color" />
      <div className="agent-toast-text">
        <b>{change.summary}</b>
        <small>{change.explanation}</small>
      </div>
      <button type="button" onClick={() => setSelection({ trackId: activeTrack, ...change.affectedBars })}>
        <ScanSearch size={13} /> {t(locale, "showBars")}
      </button>
      <button
        type="button"
        onClick={() => {
          undoChange(change.id);
          setDismissed(latestWrite.id);
        }}
      >
        <RotateCcw size={13} /> {t(locale, "undoAi")}
      </button>
      <button
        type="button"
        className="icon-button ghost"
        aria-label={t(locale, "close")}
        onClick={() => setDismissed(latestWrite.id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
