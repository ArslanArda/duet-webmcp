import { Bot, Circle, HelpCircle, Languages, Music2, PlugZap } from "lucide-react";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";

interface HeaderProps {
  siteToolsReady: boolean;
  onConnectMidi: () => void;
  onHelp: () => void;
}

export function Header({ siteToolsReady, onConnectMidi, onHelp }: HeaderProps) {
  const { project, locale, midiDevice, midiSupported, setLocale, setProjectMeta } = useProjectStore();
  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark">
          <Music2 size={18} />
        </div>
        <div>
          <h1>Duet</h1>
          <p>{t(locale, "tagline")}</p>
        </div>
      </div>
      <div className="header-controls">
        <label className="compact-field">
          <span>{t(locale, "key")}</span>
          <select
            value={project.keyCenter}
            onChange={(event) => setProjectMeta({ keyCenter: event.target.value })}
          >
            {["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"].map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </label>
        <select
          className="control"
          aria-label="Mode"
          value={project.mode}
          onChange={(event) => setProjectMeta({ mode: event.target.value })}
        >
          {["major", "minor", "dorian", "phrygian", "lydian", "mixolydian", "locrian"].map((mode) => (
            <option key={mode}>{mode}</option>
          ))}
        </select>
        <label className="compact-field tempo-field">
          <span>♩</span>
          <input
            type="number"
            min={40}
            max={220}
            value={project.tempo}
            onChange={(event) =>
              setProjectMeta({ tempo: Math.max(40, Math.min(220, Number(event.target.value))) })
            }
          />
        </label>
        {midiSupported ? (
          <button className={`control ${midiDevice ? "status-ready" : ""}`} onClick={onConnectMidi}>
            <Circle size={8} fill="currentColor" />
            {midiDevice ?? t(locale, "connectMidi")}
          </button>
        ) : null}
        <span
          className={`site-status ${siteToolsReady ? "status-ready" : ""}`}
          title={siteToolsReady ? "10 WebMCP site tools registered" : "WebMCP is not exposed by this browser"}
        >
          {siteToolsReady ? <Bot size={14} /> : <PlugZap size={14} />}
          {siteToolsReady ? t(locale, "siteToolsReady") : t(locale, "manualMode")}
        </span>
        <button
          className="icon-button"
          onClick={() => setLocale(locale === "en" ? "tr" : "en")}
          aria-label={t(locale, "language")}
        >
          <Languages size={17} />
          <span>{locale.toUpperCase()}</span>
        </button>
        <button className="icon-button icon-only" onClick={onHelp} aria-label={t(locale, "help")}>
          <HelpCircle size={18} />
        </button>
      </div>
    </header>
  );
}
