import { ChevronDown, Music2 } from "lucide-react";
import { useState } from "react";
import { applyInstruments, DEFAULT_INSTRUMENTS, previewPitches } from "../audio/player";
import { t, type TranslationKey } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { INSTRUMENTS } from "../types";
import { Popover } from "./Popover";

/** Sound for the active track; changing it plays a short preview. */
export function InstrumentPicker() {
  const { project, locale, activeTrack, setInstrument } = useProjectStore();
  const [open, setOpen] = useState(false);
  const current = project.instruments?.[activeTrack] ?? DEFAULT_INSTRUMENTS[activeTrack];
  return (
    <div className="popover-host">
      <button
        type="button"
        className="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <Music2 size={14} />
        <span className="label">{t(locale, "sound")}</span>
        <span>{t(locale, `instrument_${current}` as TranslationKey)}</span>
        <ChevronDown size={14} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} closeLabel={t(locale, "close")} className="menu">
        {INSTRUMENTS.map((instrument) => (
          <button
            type="button"
            key={instrument}
            className={`menu-item ${instrument === current ? "active" : ""}`}
            onClick={() => {
              setInstrument(activeTrack, instrument);
              applyInstruments({ ...(project.instruments ?? {}), [activeTrack]: instrument });
              void previewPitches(activeTrack === "bass" ? [40, 47] : [60, 64, 67], activeTrack, 0.8);
            }}
          >
            <b>{t(locale, `instrument_${instrument}` as TranslationKey)}</b>
          </button>
        ))}
      </Popover>
    </div>
  );
}
