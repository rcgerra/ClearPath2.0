import SlideOverPanel from './SlideOverPanel';

/** Confirmation modal shown before marking a project or department's data as reviewed, so the
 *  reviewer sees what "reviewed" is supposed to mean before it gets recorded. */
export default function DataReviewChecklistModal({
  open,
  onClose,
  onConfirm,
  confirming,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirming: boolean;
  scope: 'project' | 'department';
}) {
  const items =
    scope === 'department'
      ? [
          'The team roster matches the people actually on your team, including recent joiners and leavers.',
          'Assignments for each person on the team have been reviewed for accuracy.',
          'Availability reflects an appropriate work-life balance and employee experience \u2013 not too much, not too little, and on the right projects.',
          'Base business activities (meetings, admin, training, etc.) are logged or projected as non-project demand.',
          'Concerns and feedback raised by each person have been incorporated.',
          'Availability has been updated to reflect any known changes going forward.',
          'Demand numbers have been confirmed with project managers where relevant.',
          'This information is aligned with what each person expects their workload to be.',
        ]
      : [
          'The project team matches the people actually assigned to project work.',
          'Assignments reflect current scope, phase, and expected effort for each person.',
          'Demand numbers have been confirmed with the people and department leads involved.',
          'Any known changes to timing, scope, or staffing have been reflected.',
          'Concerns and feedback raised by team members have been incorporated.',
          'This information is aligned with what each person expects their workload to be.',
        ];

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title="Before you mark this data reviewed"
      subtitle="Confirm you have checked the following, so the review date reflects a real review."
    >
      <ul className="data-review-checklist">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <div className="row-actions data-review-checklist-actions">
        <button type="button" onClick={onClose}>Cancel</button>
        <button type="button" className="primary" onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Saving review\u2026' : 'Confirm, data has been reviewed'}
        </button>
      </div>
    </SlideOverPanel>
  );
}
