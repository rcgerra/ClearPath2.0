import { currentWeekStart, weekLabel, weekLabelShort } from '../utils/arrayParser';

interface Row {
  id: string;
  name: string;
  weeks: number[];
}

interface Props {
  rows: Row[];
  weeks: number;
}

export default function ProjectDemandGapMatrix({ rows, weeks }: Props) {
  return (
    <section className="project-demand-gap-panel" aria-labelledby="project-demand-gap-title">
      <div className="home-department-gap-heading">
        <span className="home-section-kicker">Project Team</span>
        <h3 id="project-demand-gap-title">Individual capacity gaps</h3>
        <p>Capacity gap over the next {weeks} weeks.</p>
      </div>
      <div className="home-department-gap-scroll">
        <table className="home-department-gap-table">
          <thead>
            <tr>
              <th scope="col">Person</th>
              {Array.from({ length: weeks }, (_, week) => (
                <th scope="col" key={week} title={weekLabel(week, currentWeekStart())}>{weekLabelShort(week, currentWeekStart())}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((person) => (
              <tr key={person.id}>
                <th scope="row">
                  <span className="home-department-gap-person">
                    {person.name}
                    {person.weeks.some((gap) => gap < 0) && <span className="home-department-gap-alert" role="img" aria-label="Overallocated" title="Overallocated">!</span>}
                  </span>
                </th>
                {person.weeks.slice(0, weeks).map((gap, week) => (
                  <td key={week} className={gap < 0 ? 'is-negative' : gap > 0 ? 'is-positive' : undefined}>{Math.round(gap)}</td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={weeks + 1}>No active people are assigned to this project.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
