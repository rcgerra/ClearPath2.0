import { useState } from 'react';
import type { AllocationConflict } from '../utils/allocationRisk';
import { weekLabelShort } from '../utils/arrayParser';
import { formatCount } from '../utils/format';

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
  const [copied, setCopied] = useState(false);

  /** A project manager can't change availability or other commitments themselves — this gives them
   *  the specifics to bring to the department lead or the person's manager instead of just a flag. */
  const facilitationSummary = [
    `${conflict.personName} is over-allocated by ${formatCount(conflict.totalOver)} hours across ${conflict.overWeeks.length} week${conflict.overWeeks.length === 1 ? '' : 's'} (peaking at ${formatCount(conflict.maxWeeklyOver)} hours over capacity).`,
    `Conflict window: ${weekLabelShort(conflict.overWeeks[0])} \u2013 ${weekLabelShort(conflict.overWeeks[conflict.overWeeks.length - 1])}.`,
    `Competing commitments: ${conflict.assignments.slice(0, 4).map((assignment) => `${assignment.label} (${formatCount(assignment.hours)} h)`).join(', ')}.`,
    'Decide together whether availability can flex for this window, or whether one of the commitments above should be re-scoped or delayed.',
    'Once a decision is made, ask the department lead to update availability, or update the assignment here, so the plan reflects it.',
  ];

  async function copySummary() {
    const text = [`Allocation conflict for ${conflict.personName}${conflict.departmentName ? ` (${conflict.departmentName})` : ''}`, ...facilitationSummary].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be blocked by browser permissions; the summary is still visible on screen to copy manually.
    }
  }

  return (
    <section className="conflict-resolution-panel" aria-labelledby="conflict-resolution-title">
      <div className="conflict-resolution-header">
        <div>
          <span className={`risk-severity risk-severity-${conflict.severity}`}>{conflict.severity}</span>
          <h3 id="conflict-resolution-title">Resolve {conflict.personName}'s allocation conflict</h3>
          <p className="muted">
            {formatCount(conflict.totalOver)} excess hours across {conflict.overWeeks.length} weeks, peaking at {formatCount(conflict.maxWeeklyOver)} hours over capacity.
          </p>
          <p className="conflict-resolution-ownership">
            {context === 'department'
              ? 'As department lead, you own this: adjust availability or reassign work, or ask a project manager to reduce demand.'
              : "You can't adjust availability or other commitments from here — that requires a conversation with the department lead or the person's manager. See the discussion summary below."}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close conflict resolution">Close</button>
      </div>
      <div className="conflict-resolution-cause">
        <strong>What is causing it?</strong>
        <div className="conflict-resolution-sources">
          {conflict.assignments.slice(0, 4).map((assignment) => (
            <span key={assignment.id} className={`conflict-source conflict-source-${assignment.type}`}>
              {assignment.label}<strong>{formatCount(assignment.hours)} h</strong>
            </span>
          ))}
        </div>
      </div>
      {context === 'project' && (
        <div className="conflict-resolution-facilitation">
          <strong>Facilitate a conversation</strong>
          <p className="muted">
            Bring these specifics to {conflict.departmentName ? `${conflict.departmentName}'s department lead` : 'their department lead'} or {conflict.personName}'s line manager — they own availability and other commitments.
          </p>
          <ul className="conflict-resolution-talking-points">
            {facilitationSummary.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <button type="button" onClick={copySummary}>{copied ? 'Copied to clipboard' : 'Copy discussion summary'}</button>
        </div>
      )}
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

