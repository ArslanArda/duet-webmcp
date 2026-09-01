import {
  Bot,
  Check,
  ChevronDown,
  Copy,
  Link2,
  PlugZap,
  RotateCcw,
  ScanSearch,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useReducer, useState } from "react";
import { formatRelativeTime, t } from "../i18n";
import { isAgentBusy, useActivityStore } from "../webmcp/activity";
import { AiActivityFeed } from "./AiActivityFeed";
import { useProjectStore } from "../store/projectStore";

interface AiPanelProps {
  siteToolsReady: boolean;
  howToOpen: boolean;
  onToggleHowTo: () => void;
  onCopy: (text: string) => Promise<void>;
  onClose: () => void;
}

export function AiPanel({ siteToolsReady, howToOpen, onToggleHowTo, onCopy, onClose }: AiPanelProps) {
  const { locale, changeLog, selection, undoChange, setSelection, setAnnouncement, activeTrack } =
    useProjectStore();
  const busy = useActivityStore(isAgentBusy);
  const hasActivity = useActivityStore((state) => state.activities.length > 0);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [, tick] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const timer = setInterval(tick, 30000);
    return () => clearInterval(timer);
  }, []);

  const range = selection ? { start: selection.startBar + 1, end: selection.endBar } : { start: 1, end: 4 };
  const prompts = [
    t(locale, "promptChords", range),
    t(locale, "promptBass", range),
    t(locale, "promptMood", range),
    t(locale, "promptMelody", range),
  ];

  const copy = async (text: string) => {
    await onCopy(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText((current) => (current === text ? null : current)), 1800);
  };

  return (
    <aside className="ai-panel" id="ai-panel" aria-label={t(locale, "aiPanelTitle")}>
      <div className="panel-head">
        <div>
          <h2>
            <Sparkles size={16} className="agent-color" /> {t(locale, "aiPanelTitle")}
          </h2>
          <span className={`status-pill ${siteToolsReady ? "ready" : ""} ${busy ? "busy" : ""}`}>
            {siteToolsReady ? <Bot size={13} /> : <PlugZap size={13} />}
            {busy
              ? t(locale, "aiWorking")
              : siteToolsReady
                ? t(locale, "aiConnected")
                : t(locale, "aiNotHere")}
          </span>
        </div>
        <button
          type="button"
          className="icon-button ghost panel-close"
          onClick={onClose}
          aria-label={t(locale, "closePanel")}
        >
          <X size={18} />
        </button>
      </div>
      <p className="panel-body">
        {siteToolsReady ? t(locale, "aiConnectedBody") : t(locale, "aiNotHereBody")}
      </p>

      {!siteToolsReady ? (
        <div className={`how-to ${howToOpen ? "open" : ""}`}>
          <button type="button" className="how-to-toggle" aria-expanded={howToOpen} onClick={onToggleHowTo}>
            <span>{t(locale, "howToConnect")}</span>
            <ChevronDown size={15} />
          </button>
          {howToOpen ? (
            <ol>
              <li>{t(locale, "howToStep1")}</li>
              <li>{t(locale, "howToStep2")}</li>
              <li>{t(locale, "howToStep3")}</li>
              <li>
                <button
                  type="button"
                  className="button small"
                  onClick={async () => {
                    await navigator.clipboard.writeText(window.location.href);
                    setAnnouncement(t(locale, "linkCopied"));
                    setCopiedText("link");
                    setTimeout(() => setCopiedText(null), 1800);
                  }}
                >
                  {copiedText === "link" ? <Check size={14} /> : <Link2 size={14} />}
                  {copiedText === "link" ? t(locale, "linkCopied") : t(locale, "copyLink")}
                </button>
              </li>
            </ol>
          ) : null}
        </div>
      ) : null}

      {siteToolsReady || hasActivity ? (
        <section className="activity-section">
          <p className="field-label">{t(locale, "activityTitle")}</p>
          <AiActivityFeed />
        </section>
      ) : null}

      <section className="prompt-box">
        <p className="field-label">{t(locale, "tryAsking")}</p>
        {prompts.map((prompt) => (
          <button
            type="button"
            className={`prompt-chip ${copiedText === prompt ? "copied" : ""}`}
            key={prompt}
            onClick={() => copy(prompt)}
          >
            <span>“{prompt}”</span>
            {copiedText === prompt ? <Check size={14} /> : <Copy size={14} />}
          </button>
        ))}
      </section>

      <section className="change-section">
        <p className="field-label">{t(locale, "whatChanged")}</p>
        {changeLog.length ? (
          <div className="change-list">
            {changeLog.map((change) => (
              <article className="change-card" key={change.id}>
                <div className="change-icon">
                  <Bot size={15} />
                </div>
                <div className="change-body">
                  <p>{change.summary}</p>
                  <div className="change-meta">
                    <span>
                      {change.affectedBars.startBar + 1}–{change.affectedBars.endBar}
                    </span>
                    {change.notesAdded ? (
                      <span className="badge add">
                        {t(locale, "notesAdded", { count: change.notesAdded })}
                      </span>
                    ) : null}
                    {change.notesRemoved ? (
                      <span className="badge remove">
                        {t(locale, "notesRemoved", { count: change.notesRemoved })}
                      </span>
                    ) : null}
                    <span>{formatRelativeTime(change.timestamp, locale)}</span>
                  </div>
                  <small>{change.explanation}</small>
                  <div className="change-actions">
                    <button
                      type="button"
                      onClick={() => setSelection({ trackId: activeTrack, ...change.affectedBars })}
                    >
                      <ScanSearch size={13} /> {t(locale, "showBars")}
                    </button>
                    <button type="button" onClick={() => undoChange(change.id)}>
                      <RotateCcw size={13} /> {t(locale, "undoAi")}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <Bot size={22} />
            <p>{t(locale, "noChanges")}</p>
          </div>
        )}
      </section>
    </aside>
  );
}
