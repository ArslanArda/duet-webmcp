import {
  Bot,
  ChevronDown,
  FilePlus2,
  HelpCircle,
  Languages,
  Music2,
  Piano,
  PlugZap,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { previewPitches } from "../audio/player";
import { t, type TranslationKey } from "../i18n";
import { MODE_MOODS, ROOT_LABELS, tempoWord, TEMPO_PRESETS } from "../music/chordCatalog";
import { chordPitches } from "../music/voicing";
import { useProjectStore } from "../store/projectStore";
import { KEY_CENTERS, MODES, type Mode } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { Popover } from "./Popover";
import { isAgentBusy, useActivityStore } from "../webmcp/activity";

interface AppHeaderProps {
  siteToolsReady: boolean;
  onConnectMidi: () => void;
  onHelp: () => void;
  onAiInfo: () => void;
}

type Menu = "project" | "key" | "tempo" | null;

export function AppHeader({ siteToolsReady, onConnectMidi, onHelp, onAiInfo }: AppHeaderProps) {
  const {
    project,
    locale,
    midiDevice,
    midiSupported,
    setLocale,
    setProjectMeta,
    newProject,
    loadDemoProject,
  } = useProjectStore();
  const [menu, setMenu] = useState<Menu>(null);
  const busy = useActivityStore(isAgentBusy);
  const [confirm, setConfirm] = useState<"new" | "demo" | null>(null);
  const close = () => setMenu(null);
  const toggle = (name: Menu) => setMenu((current) => (current === name ? null : name));
  const mode = (MODES.includes(project.mode as Mode) ? project.mode : "major") as Mode;
  const modeName = t(locale, `mode_${mode}` as TranslationKey);

  const previewKey = (keyCenter: string, nextMode: string) => {
    const symbol = ["minor", "dorian", "phrygian"].includes(nextMode)
      ? `${keyCenter}m`
      : nextMode === "locrian"
        ? `${keyCenter}dim`
        : keyCenter;
    void previewPitches(chordPitches(symbol, 48, 72), "chords", 1.1);
  };

  return (
    <header className="app-header">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <Music2 size={18} />
        </div>
        <div>
          <h1>Duet</h1>
          <p>{t(locale, "tagline")}</p>
        </div>
      </div>

      <div className="header-controls">
        <div className="popover-host">
          <button
            type="button"
            className="button"
            aria-expanded={menu === "project"}
            onClick={() => toggle("project")}
          >
            <FilePlus2 size={15} />
            <span>{t(locale, "project")}</span>
            <ChevronDown size={14} />
          </button>
          <Popover open={menu === "project"} onClose={close} closeLabel={t(locale, "close")} className="menu">
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close();
                setConfirm("new");
              }}
            >
              <b>{t(locale, "newProject")}</b>
              <small>{t(locale, "newProjectHint")}</small>
            </button>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                close();
                setConfirm("demo");
              }}
            >
              <b>{t(locale, "loadDemo")}</b>
              <small>{t(locale, "loadDemoHint")}</small>
            </button>
          </Popover>
        </div>

        <div className="popover-host">
          <button
            type="button"
            className="button"
            aria-expanded={menu === "key"}
            onClick={() => toggle("key")}
          >
            <span className="label">{t(locale, "key")}</span>
            <span>
              {ROOT_LABELS[project.keyCenter as keyof typeof ROOT_LABELS] ?? project.keyCenter} ·{" "}
              {MODE_MOODS[mode][locale]}
            </span>
            <span className="muted">({modeName})</span>
            <ChevronDown size={14} />
          </button>
          <Popover
            open={menu === "key"}
            onClose={close}
            title={t(locale, "keyPickerTitle")}
            hint={t(locale, "keyPickerHint")}
            closeLabel={t(locale, "close")}
            className="key-picker"
          >
            <p className="field-label">{t(locale, "rootNote")}</p>
            <div className="chip-grid roots">
              {KEY_CENTERS.map((keyCenter) => (
                <button
                  type="button"
                  key={keyCenter}
                  className={`chip ${project.keyCenter === keyCenter ? "active" : ""}`}
                  onClick={() => {
                    setProjectMeta({ keyCenter });
                    previewKey(keyCenter, project.mode);
                  }}
                >
                  {ROOT_LABELS[keyCenter]}
                </button>
              ))}
            </div>
            <p className="field-label">{t(locale, "mood")}</p>
            <div className="option-list">
              {MODES.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={`option ${project.mode === item ? "active" : ""}`}
                  onClick={() => {
                    setProjectMeta({ mode: item });
                    previewKey(project.keyCenter, item);
                  }}
                >
                  <b>{MODE_MOODS[item][locale]}</b>
                  <small>{t(locale, `mode_${item}` as TranslationKey)}</small>
                </button>
              ))}
            </div>
          </Popover>
        </div>

        <div className="popover-host">
          <button
            type="button"
            className="button"
            aria-expanded={menu === "tempo"}
            onClick={() => toggle("tempo")}
          >
            <span className="label">{t(locale, "tempo")}</span>
            <span>
              {tempoWord(project.tempo, locale)} · {project.tempo}
            </span>
            <ChevronDown size={14} />
          </button>
          <Popover
            open={menu === "tempo"}
            onClose={close}
            title={t(locale, "tempoPickerTitle")}
            hint={t(locale, "tempoPickerHint")}
            closeLabel={t(locale, "close")}
            align="end"
            className="tempo-picker"
          >
            <div className="chip-grid">
              {TEMPO_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  className={`chip ${project.tempo === preset.bpm ? "active" : ""}`}
                  onClick={() => setProjectMeta({ tempo: preset.bpm })}
                >
                  {tempoWord(preset.bpm, locale)} · {preset.bpm}
                </button>
              ))}
            </div>
            <label className="slider-row">
              <input
                type="range"
                min={40}
                max={220}
                value={project.tempo}
                onChange={(event) => setProjectMeta({ tempo: Number(event.target.value) })}
              />
              <input
                type="number"
                min={40}
                max={220}
                value={project.tempo}
                aria-label={t(locale, "bpm")}
                onChange={(event) =>
                  setProjectMeta({ tempo: Math.max(40, Math.min(220, Number(event.target.value) || 40)) })
                }
              />
              <span>{t(locale, "bpm")}</span>
            </label>
          </Popover>
        </div>

        {midiSupported ? (
          <button
            type="button"
            className={`button midi-button ${midiDevice ? "ready" : ""}`}
            onClick={onConnectMidi}
            title={midiDevice ? t(locale, "midiConnected", { device: midiDevice }) : t(locale, "connectMidi")}
          >
            <Piano size={15} />
            <span>{midiDevice ?? t(locale, "connectMidi")}</span>
          </button>
        ) : null}

        <button
          type="button"
          className={`button ai-status ${siteToolsReady ? "ready" : ""} ${busy ? "busy" : ""}`}
          onClick={onAiInfo}
          title={siteToolsReady ? t(locale, "aiConnected") : t(locale, "howToConnect")}
        >
          {siteToolsReady ? <Sparkles size={15} /> : <PlugZap size={15} />}
          <span>
            {busy
              ? t(locale, "aiWorking")
              : siteToolsReady
                ? t(locale, "aiConnected")
                : t(locale, "aiNotHere")}
          </span>
          {!siteToolsReady ? <Bot size={14} className="muted" /> : null}
        </button>

        <button
          type="button"
          className="icon-button"
          onClick={() => setLocale(locale === "en" ? "tr" : "en")}
          aria-label={t(locale, "language")}
          title={t(locale, "language")}
        >
          <Languages size={17} />
          <span>{locale.toUpperCase()}</span>
        </button>
        <button
          type="button"
          className="icon-button"
          onClick={onHelp}
          aria-label={t(locale, "help")}
          title={t(locale, "help")}
        >
          <HelpCircle size={18} />
        </button>
      </div>

      <ConfirmDialog
        open={confirm !== null}
        title={t(locale, confirm === "demo" ? "confirmDemoTitle" : "confirmNewTitle")}
        body={t(locale, confirm === "demo" ? "confirmDemoBody" : "confirmNewBody")}
        confirmLabel={t(locale, "confirm")}
        cancelLabel={t(locale, "cancel")}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === "demo") loadDemoProject();
          else newProject();
          setConfirm(null);
        }}
      />
    </header>
  );
}
