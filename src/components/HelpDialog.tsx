import { X } from "lucide-react";
import { useEffect } from "react";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  const { locale, resetOnboarding } = useProjectStore();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);
  if (!open) return null;
  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const shortcuts: Array<[string, string]> = [
    ["Space", t(locale, "shortcutPlay")],
    [`${mod} Z`, t(locale, "shortcutUndo")],
    [`${mod} ⇧ Z`, t(locale, "shortcutRedo")],
    ["Delete", t(locale, "shortcutDelete")],
    ["Esc", t(locale, "shortcutEscape")],
    ["A – L", t(locale, "shortcutKeys")],
  ];
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div
        className="modal help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="help-title">{t(locale, "helpTitle")}</h2>
          <button
            type="button"
            className="icon-button ghost"
            onClick={onClose}
            aria-label={t(locale, "close")}
          >
            <X size={18} />
          </button>
        </div>
        <section>
          <h3>{t(locale, "helpGridTitle")}</h3>
          <p>{t(locale, "helpGridBody")}</p>
        </section>
        <section>
          <h3>{t(locale, "helpTracksTitle")}</h3>
          <p>{t(locale, "helpTracksBody")}</p>
        </section>
        <section>
          <h3>{t(locale, "helpAiTitle")}</h3>
          <p>{t(locale, "helpAiBody")}</p>
        </section>
        <section>
          <h3>{t(locale, "helpShortcutsTitle")}</h3>
          <dl className="shortcuts">
            {shortcuts.map(([keys, label]) => (
              <div key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div className="modal-actions">
          <button
            type="button"
            className="button"
            onClick={() => {
              resetOnboarding();
              onClose();
            }}
          >
            {t(locale, "restartGuide")}
          </button>
          <button type="button" className="button primary" onClick={onClose}>
            {t(locale, "close")}
          </button>
        </div>
      </div>
    </div>
  );
}
