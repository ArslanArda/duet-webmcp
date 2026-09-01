import { Bot, Check, Copy, MousePointer2, Pencil, X } from "lucide-react";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";

export function Onboarding() {
  const { locale, onboarding, completeOnboarding } = useProjectStore();
  if (onboarding.every(Boolean)) return null;
  const copyPrompt = async () => {
    await navigator.clipboard.writeText(t(locale, "promptJazz")); completeOnboarding(2);
    useProjectStore.getState().setAnnouncement(t(locale, "copied"));
  };
  const lessons = [
    { icon: Pencil, title: t(locale, "addNote"), hint: t(locale, "addNoteHint") },
    { icon: MousePointer2, title: t(locale, "selectBars"), hint: t(locale, "selectBarsHint") },
    { icon: Bot, title: t(locale, "askAi"), hint: t(locale, "askAiHint"), action: copyPrompt },
  ];
  return (
    <section className="onboarding" aria-label={t(locale, "startHere")}>
      <div className="onboarding-copy"><div><p className="eyebrow">{t(locale, "startHere")}</p><p>{t(locale, "onboardingIntro")}</p></div><button className="dismiss-guide" onClick={() => { completeOnboarding(0); completeOnboarding(1); completeOnboarding(2); }} aria-label={t(locale, "skip")}><X size={16} /></button></div>
      <div className="lesson-row">{lessons.map(({ icon: Icon, title, hint, action }, index) => <button key={title} className={`lesson ${onboarding[index] ? "lesson-complete" : !onboarding.slice(0, index).some((done) => !done) ? "lesson-active" : ""}`} onClick={action}><span className="lesson-icon">{onboarding[index] ? <Check size={15} /> : <Icon size={15} />}</span><span><b>{index + 1}. {title}</b><small>{hint}</small></span>{action ? <Copy className="lesson-copy" size={14} /> : null}</button>)}</div>
    </section>
  );
}
