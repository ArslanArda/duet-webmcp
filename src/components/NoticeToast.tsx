import { Info, X } from "lucide-react";
import { t } from "../i18n";
import { useProjectStore } from "../store/projectStore";

/** Visible, dismissible notice (e.g. no MIDI inputs in this browser). */
export function NoticeToast() {
  const { locale, notice, setNotice } = useProjectStore();
  if (!notice) return null;
  return (
    <div className="notice-toast" role="status">
      <Info size={15} />
      <span>{notice}</span>
      <button
        type="button"
        className="icon-button ghost"
        aria-label={t(locale, "close")}
        onClick={() => setNotice(null)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
