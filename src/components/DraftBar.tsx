import { Check, Sparkles, Volume2, X } from "lucide-react";
import { playProject, stopPlayback, unlockAudio } from "../audio/player";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { applyDraftPatch } from "../store/drafts";

/** Agent proposals wait here: audition each by ear, then accept or discard. */
export function DraftBar() {
  const {
    locale,
    drafts,
    activeDraftId,
    setActiveDraft,
    acceptDraft,
    discardDraft,
    setPlaying,
    setAnnouncement,
    isLooping,
    project,
  } = useProjectStore();
  if (!drafts.length) return null;
  const active = drafts.find((draft) => draft.id === activeDraftId) ?? drafts[drafts.length - 1];

  const listen = async () => {
    if (!(await unlockAudio())) return;
    const { startBar, endBar } = active.affectedBars;
    if (
      playProject(applyDraftPatch(project, active), startBar, endBar, {
        loop: isLooping,
        onEnded: () => setPlaying(false),
      })
    )
      setPlaying(true);
  };
  const accept = () => {
    stopPlayback();
    setPlaying(false);
    acceptDraft(active.id);
    setAnnouncement(t(locale, "draftAccepted"));
  };

  return (
    <div className="draft-bar" role="region" aria-label={t(locale, "draftTitle")}>
      <div className="draft-top">
        <span className="draft-icon">
          <Sparkles size={15} />
        </span>
        <div className="draft-head">
          <b>{drafts.length > 1 ? t(locale, "draftTitleMany") : t(locale, "draftTitle")}</b>
          <small>{t(locale, "draftHint")}</small>
        </div>
      </div>
      {drafts.length > 1 ? (
        <div className="draft-options">
          {drafts.map((draft, index) => (
            <button
              type="button"
              key={draft.id}
              className={`chip draft-chip ${draft.id === active.id ? "active" : ""}`}
              onClick={() => setActiveDraft(draft.id)}
              title={draft.explanation}
            >
              <b>{String.fromCharCode(65 + index)}</b>
              <span>{draft.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="draft-summary">
          <b>{active.label}</b> · {active.explanation}
        </p>
      )}
      <div className="draft-actions">
        <button type="button" className="button" onClick={() => void listen()}>
          <Volume2 size={15} /> {t(locale, "draftListen")}
        </button>
        <button type="button" className="button primary" onClick={accept}>
          <Check size={15} /> {t(locale, "draftAccept")}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            stopPlayback();
            setPlaying(false);
            discardDraft(active.id);
          }}
        >
          <X size={15} /> {t(locale, "draftDiscard")}
        </button>
        {drafts.length > 1 ? (
          <button type="button" className="button small" onClick={() => discardDraft("all")}>
            {t(locale, "draftDiscardAll")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
