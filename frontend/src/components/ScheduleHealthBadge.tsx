import type { ProjectScheduleHealth } from '../utils/projectSchedule';

export default function ScheduleHealthBadge({ health }: { health: ProjectScheduleHealth }) {
  return (
    <span className={`schedule-health schedule-health-${health.status}`} title={health.reasons.join(' ')}>
      {health.label}
    </span>
  );
}