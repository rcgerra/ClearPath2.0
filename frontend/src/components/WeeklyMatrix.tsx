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
}

/** Availability on the top row, one row per project below, a column per week. */
export default function WeeklyMatrix({ weeks, availability, projects }: Props) {
  const columns = Array.from({ length: weeks }, (_, index) => index);

  return (
    <div className="matrix-scroll">
      <table className="weekly-matrix">
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
              Availability
            </th>
            {columns.map((index) => (
              <td key={index}>{availability[index] ?? 0}</td>
            ))}
          </tr>
          {projects.map((project) => (
            <tr key={project.id}>
              <th scope="row" className="matrix-label">
                {project.label}
              </th>
              {columns.map((index) => {
                const hours = project.weeks[index] ?? 0;
                return (
                  <td key={index} className={hours > 0 ? 'has-demand' : undefined}>
                    {hours || ''}
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
      </table>
    </div>
  );
}
