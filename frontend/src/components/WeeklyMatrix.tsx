import { weekLabelShort } from '../utils/arrayParser';

export interface MatrixRow {
  id: string;
  label: string;
  weeks: number[];
}

interface Props {
  weeks: number;
  availability: number[];
  projects: MatrixRow[];
  totalDemand: number[];
  onDemandChange: (assignmentId: string, week: number, hours: number) => void;
}

/** Availability on the top row, one row per project below, a column per week. */
export default function WeeklyMatrix({ weeks, availability, projects, totalDemand, onDemandChange }: Props) {
  const columns = Array.from({ length: weeks }, (_, index) => index);

  return (
    <div className="matrix-scroll">
      <table className="weekly-matrix demand-grid my-work-matrix">
        <thead>
          <tr>
            <th className="matrix-label">Project</th>
            {columns.map((index) => (
              <th key={index}>{weekLabelShort(index)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="matrix-availability">
            <th scope="row" className="matrix-label">
              My Availability
            </th>
            {columns.map((index) => (
              <td key={index}>{availability[index] ?? 0}</td>
            ))}
          </tr>
          {projects.map((project) => (
            <tr key={project.id} className="assignment-row">
              <th scope="row" className="matrix-label">
                {project.label}
              </th>
              {columns.map((index) => {
                const hours = project.weeks[index] ?? 0;
                return (
                  <td key={index} className={hours > 0 ? 'has-demand' : undefined}>
                    <input
                      type="number"
                      min={0}
                      max={99}
                      defaultValue={hours}
                      aria-label={`${project.label}, ${weekLabelShort(index)}`}
                      onBlur={(event) => {
                        const next = Math.min(99, Math.max(0, Math.round(Number(event.target.value) || 0)));
                        event.target.value = String(next);
                        if (next !== hours) onDemandChange(project.id, index, next);
                      }}
                      onKeyDown={(event) => {
                        if (['-', '+', '.', 'e', 'E'].includes(event.key)) event.preventDefault();
                        if (event.key === 'Enter') event.currentTarget.blur();
                      }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
          {projects.length === 0 && (
            <tr>
              <td colSpan={weeks + 1} className="muted">
                No project demand in this window.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="matrix-total row-total-demand">
            <th scope="row" className="matrix-label">Total demand</th>
            {columns.map((index) => (
              <td key={index}>{totalDemand[index] ?? 0}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
