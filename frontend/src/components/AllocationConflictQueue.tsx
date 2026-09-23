import { useState } from 'react';
import { weekLabelShort } from '../utils/arrayParser';
import type { AllocationConflict, RiskSeverity } from '../utils/allocationRisk';

const SEVERITY_LABELS: Record<RiskSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  moderate: 'Moderate',
};

export default function AllocationConflictQueue({
  conflicts,
  onOpen,
  emptyMessage = 'No allocation conflicts in the selected horizon.',
}: {
  conflicts: AllocationConflict[];
  onOpen?: (conflict: AllocationConflict) => void;
  emptyMessage?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (!conflicts.length) return <p className="muted">{emptyMessage}</p>;
  const visibleConflicts = showAll ? conflicts : conflicts.slice(0, 8);

  return (
    <div className="allocation-conflict-list">
      {visibleConflicts.map((conflict) => {
        const firstWeek = conflict.overWeeks[0];
        const lastWeek = conflict.overWeeks[conflict.overWeeks.length - 1];
        const weekRange = firstWeek === lastWeek ? weekLabelShort(firstWeek) : `${weekLabelShort(firstWeek)}–${weekLabelShort(lastWeek)}`;
        return (
          <article className="allocation-conflict" key={conflict.personId}>
            <div className="allocation-conflict-summary">
              <span className={`risk-severity risk-severity-${conflict.severity}`}>{SEVERITY_LABELS[conflict.severity]}</span>
              <div>
                <strong>{conflict.personName}</strong>
                <small>{conflict.departmentName ?? 'Department not assigned'}</small>
              </div>
              <div><strong>{Math.round(conflict.totalOver).toLocaleString('en-US')} h</strong><small>Total over</small></div>
              <div><strong>{conflict.overWeeks.length}</strong><small>Weeks over</small></div>
              <div><strong>{Math.round(conflict.maxWeeklyOver)} h</strong><small>Peak weekly</small></div>
              <div><strong>{weekRange}</strong><small>Conflict window</small></div>
              {onOpen && <button type="button" onClick={() => onOpen(conflict)}>Resolve</button>}
            </div>
            <div className="allocation-conflict-sources" aria-label={`Assignments contributing to ${conflict.personName}'s conflict`}>
              {conflict.assignments.slice(0, 5).map((assignment) => (
                <span key={assignment.id} className={`conflict-source conflict-source-${assignment.type}`}>
                  {assignment.label}<strong>{Math.round(assignment.hours)} h</strong>
                </span>
              ))}
              {conflict.assignments.length > 5 && <span className="conflict-source-more">+{conflict.assignments.length - 5} more</span>}
            </div>
          </article>
        );
      })}
      {conflicts.length > 8 && (
        <button type="button" className="allocation-conflict-expand" onClick={() => setShowAll((current) => !current)}>
          {showAll ? 'Show fewer conflicts' : `Show all ${conflicts.length} conflicts`}
        </button>
      )}
    </div>
  );
}