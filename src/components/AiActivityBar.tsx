import { Bot, ChevronUp } from "lucide-react";
import { formatRelativeTime, t } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { describeActivity, isAgentBusy, useActivityStore } from "../webmcp/activity";
import { ActivityIcon } from "./AiActivityFeed";

interface AiActivityBarProps {
  siteToolsReady: boolean;
  onOpen: () => void;
}

/** Narrow layouts (ChatGPT's side-by-side browser) dock the latest AI action above the transport. */
export function AiActivityBar({ siteToolsReady, onOpen }: AiActivityBarProps) {
  const { locale, changeLog } = useProjectStore();
  const activities = useActivityStore((state) => state.activities);
  const busy = useActivityStore(isAgentBusy);
  if (!siteToolsReady && !activities.length) return null;
  const latest = activities.find((item) => item.status === "running") ?? activities[0];
  return (
    <button type="button" className={`activity-bar ${busy ? "busy" : ""}`} onClick={onOpen}>
      <span className="activity-icon">
        {latest ? <ActivityIcon activity={latest} size={15} /> : <Bot size={15} />}
      </span>
      <span className="activity-bar-text">
        {latest ? (
          <>
            <span>{describeActivity(latest, locale)}</span>
            {latest.status !== "running" ? (
              <small>{formatRelativeTime(latest.endedAt ?? latest.startedAt, locale)}</small>
            ) : null}
          </>
        ) : (
          <span>{t(locale, "aiIdle")}</span>
        )}
      </span>
      {changeLog.length ? <b className="count">{changeLog.length}</b> : null}
      <span className="activity-bar-open">
        {t(locale, "details")} <ChevronUp size={14} />
      </span>
    </button>
  );
}
