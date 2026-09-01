import { Circle } from "lucide-react";
import { t } from "../i18n";
import { useLiveInput } from "../input/liveInput";
import { useProjectStore } from "../store/projectStore";

/** Big on-screen count-in over the grid, then a small "recording into…" tag. */
export function CountInOverlay() {
  const { locale, activeTrack, isRecording } = useProjectStore();
  const countIn = useLiveInput((state) => state.countIn);
  if (countIn !== null) {
    return (
      <div className="count-in" aria-live="assertive">
        <span key={countIn} className="count-in-number">
          {countIn}
        </span>
        <span className="count-in-label">
          {t(locale, "getReady")} · {t(locale, "recordTarget", { track: t(locale, activeTrack) })}
        </span>
      </div>
    );
  }
  if (!isRecording) return null;
  return (
    <div className="recording-tag" aria-live="polite">
      <Circle size={9} fill="currentColor" />
      {t(locale, "recordingInto", { track: t(locale, activeTrack) })}
    </div>
  );
}
