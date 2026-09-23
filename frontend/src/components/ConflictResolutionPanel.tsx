import type { AllocationConflict } from '../utils/allocationRisk';

export default function ConflictResolutionPanel({
  conflict,
  context,
  onStartWhatIf,
  onOpenTeam,
  onClose,
}: {
  conflict: AllocationConflict;
  /** Adjusts guidance: department leads own resolution by adjusting availability; PMs mostly review and flag it. */
  context: 'project' | 'department';
  /** Only used in department context — what-if scenario planning is a department-lead tool. */
  onStartWhatIf?: () => void;
  onOpenTeam: () => void;
  onClose: () => void;
}) {
  return (
    <section className="conflict-resolution-panel" aria-labelledby="conflict-resolution-title">
      <div className="conflict-resolution-header">
        <div>
          <span className={`risk-severity risk-severity-${conflict.severity}`}>{conflict.severity}</span>
          <h3 id="conflict-resolution-title">Resolve {conflict.personName}'s allocation conflict</h3>
          <p className="muted">
            {Math.round(conflict.totalOver).toLocaleString('en-US')} excess hours across {conflict.overWeeks.length} weeks, peaking at {Math.round(conflict.maxWeeklyOver)} hours over capacity.
          </p>
          <p className="conflict-resolution-ownership">
            {context === 'department'
              ? 'As department lead, you own this: adjust availability or reassign work, or ask a project manager to reduce demand.'
              : 'Department leads own resolution — adjusting availability or reassigning work. Review the assignment here and raise it with them.'}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close conflict resolution">Close</button>
      </div>
      <div className="conflict-resolution-cause">
        <strong>What is causing it?</strong>
        <div className="conflict-resolution-sources">
          {conflict.assignments.slice(0, 4).map((assignment) => (
            <span key={assignment.id} className={`conflict-source conflict-source-${assignment.type}`}>
              {assignment.label}<strong>{Math.round(assignment.hours)} h</strong>
            </span>
          ))}
        </div>
      </div>
      <div className="conflict-resolution-options">
        {context === 'department' && onStartWhatIf && (
          <article>
            <span className="resolution-step">1</span>
            <div>
              <strong>Test an availability change</strong>
              <p>Draft a week-by-week availability change for {conflict.personName} and see whether it clears the conflict before you apply it.</p>
            </div>
            <button type="button" className="primary" onClick={onStartWhatIf}>Open what-if</button>
          </article>
        )}
        <article>
          <span className="resolution-step">{context === 'department' ? 2 : 1}</span>
          <div><strong>Review another person</strong><p>Return to the team view and compare recommended candidates before changing the assignment.</p></div>
          <button type="button" onClick={onOpenTeam}>Review candidates</button>
        </article>
        <article>
          <span className="resolution-step">{context === 'department' ? 3 : 2}</span>
          <div><strong>Check capacity assumptions</strong><p>Review the person's weekly availability and competing project or other-work commitments.</p></div>
          <button type="button" onClick={onOpenTeam}>Review assignments</button>
        </article>
      </div>
    </section>
  );
}

