import { Bot, Check, Copy, ExternalLink, Pencil, Play, X } from "lucide-react";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";

interface WelcomeCardProps {
  siteToolsReady: boolean;
  onPlay: () => void;
  onCopyPrompt: () => void;
  onAiInfo: () => void;
}

export function WelcomeCard({ siteToolsReady, onPlay, onCopyPrompt, onAiInfo }: WelcomeCardProps) {
  const { locale, onboarding, guideDismissed, dismissGuide, completeOnboarding } = useProjectStore();
  if (guideDismissed || onboarding.every(Boolean)) return null;
  const steps = [
    { icon: Play, title: t(locale, "stepPlay"), hint: t(locale, "stepPlayHint"), action: onPlay },
    { icon: Pencil, title: t(locale, "stepNote"), hint: t(locale, "stepNoteHint") },
    siteToolsReady
      ? {
          icon: Bot,
          title: t(locale, "stepAsk"),
          hint: t(locale, "stepAskHint"),
          action: onCopyPrompt,
          trailing: Copy,
        }
      : {
          icon: Bot,
          title: t(locale, "stepOpen"),
          hint: t(locale, "stepOpenHint"),
          action: () => {
            completeOnboarding(2);
            onAiInfo();
          },
          trailing: ExternalLink,
        },
  ];
  const activeIndex = onboarding.findIndex((done) => !done);
  return (
    <section className="welcome" aria-label={t(locale, "startHere")}>
      <div className="welcome-copy">
        <div>
          <p className="eyebrow">{t(locale, "startHere")}</p>
          <p>{t(locale, "welcomeIntro")}</p>
        </div>
        <button
          type="button"
          className="icon-button ghost"
          onClick={dismissGuide}
          aria-label={t(locale, "dismiss")}
        >
          <X size={16} />
        </button>
      </div>
      <div className="step-row">
        {steps.map(({ icon: Icon, title, hint, action, trailing: Trailing }, index) => {
          const done = onboarding[index];
          const className = `step ${done ? "done" : index === activeIndex ? "active" : ""}`;
          const body = (
            <>
              <span className="step-icon">{done ? <Check size={15} /> : <Icon size={15} />}</span>
              <span className="step-text">
                <b>
                  {index + 1}. {title}
                </b>
                <small>{hint}</small>
              </span>
              {Trailing && !done ? <Trailing className="step-trailing" size={14} /> : null}
            </>
          );
          return action ? (
            <button type="button" key={title} className={className} onClick={action}>
              {body}
            </button>
          ) : (
            <div key={title} className={className}>
              {body}
            </div>
          );
        })}
      </div>
    </section>
  );
}
