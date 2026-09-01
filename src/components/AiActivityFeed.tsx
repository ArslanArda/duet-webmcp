import { AlertTriangle, Eye, Loader2, MousePointer2, Pencil } from "lucide-react";
import { formatRelativeTime, t } from "../i18n";
import { useProjectStore } from "../store/projectStore";
import { describeActivity, useActivityStore, type Activity } from "../webmcp/activity";

const ICONS = { read: Eye, control: MousePointer2, write: Pencil };

export function ActivityIcon({ activity, size = 14 }: { activity: Activity; size?: number }) {
  if (activity.status === "running") return <Loader2 size={size} className="spin" />;
  if (activity.status === "error") return <AlertTriangle size={size} />;
  const Icon = ICONS[activity.kind];
  return <Icon size={size} />;
}

export function AiActivityFeed({ limit = 12 }: { limit?: number }) {
  const locale = useProjectStore((state) => state.locale);
  const activities = useActivityStore((state) => state.activities);
  if (!activities.length) return <p className="hint">{t(locale, "activityEmpty")}</p>;
  return (
    <ol className="activity-list">
      {activities.slice(0, limit).map((activity) => (
        <li key={activity.id} className={`activity ${activity.kind} ${activity.status}`}>
          <span className="activity-icon">
            <ActivityIcon activity={activity} />
          </span>
          <span className="activity-text">
            <span>{describeActivity(activity, locale)}</span>
            {activity.status === "error" && activity.errorHint ? <small>{activity.errorHint}</small> : null}
          </span>
          <time>
            {activity.status === "running"
              ? ""
              : formatRelativeTime(activity.endedAt ?? activity.startedAt, locale)}
          </time>
        </li>
      ))}
    </ol>
  );
}
