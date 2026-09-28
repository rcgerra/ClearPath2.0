interface Band {
  min: number;
  max: number;
  rank: number | null;
  total: number;
  label: string;
}

interface Props {
  score: number;
  portfolio: Band;
  program: Band | null;
}

const QUARTILE_STARS: Record<string, number> = {
  'Highest quartile': 4,
  'Upper-middle quartile': 3,
  'Lower-middle quartile': 2,
  'Lowest quartile': 1,
};

/** Position of a score inside a band, clamped so markers never escape the track. */
function percentWithin(score: number, band: Band): number {
  if (band.max <= band.min) return 50;
  return Math.min(100, Math.max(0, ((score - band.min) / (band.max - band.min)) * 100));
}

function Marker({ band, score, placement }: { band: Band; score: number; placement: 'top' | 'bottom' }) {
  return (
    <span className={`priority-range-marker priority-range-marker-${placement}`} style={{ left: `${percentWithin(score, band)}%` }}>
      {placement === 'bottom' && <span className="priority-range-arrow" aria-hidden="true">▲</span>}
      <span className="priority-range-marker-label">
        {band.label} · {band.rank === null ? 'unranked' : `#${band.rank} of ${band.total}`}
      </span>
      {placement === 'top' && <span className="priority-range-arrow" aria-hidden="true">▼</span>}
    </span>
  );
}

/** Quartile stars, or a ranked diamond when the request is in the portfolio top ten. */
export function PrioritizationStanding({ rank, quartile, topTen }: { rank: number | null; quartile?: string; topTen?: boolean }) {
  const stars = QUARTILE_STARS[quartile ?? ''] ?? 0;

  return (
    <div className="priority-range-standing">
      {topTen && rank !== null ? (
        <span className="priority-rank-diamond" title={`Top ten — rank ${rank}`}>
          <span>{rank}</span>
        </span>
      ) : (
        <span className="priority-rank-stars" title={quartile ?? 'Unranked'} aria-label={quartile ?? 'Unranked'}>
          {[1, 2, 3, 4].map((position) => (
            <span key={position} className={position <= stars ? 'is-filled' : ''} aria-hidden="true">★</span>
          ))}
        </span>
      )}
      <small>{topTen ? 'Top ten' : quartile ?? 'Unranked'}</small>
    </div>
  );
}

/** Where a request's priority score sits across the portfolio and within its program. */
export default function PrioritizationRangeBar({ score, portfolio, program }: Props) {
  return (
    <div className="priority-range">
      <div className="priority-range-plot">
        <div className="priority-range-track">
          <Marker band={portfolio} score={score} placement="top" />
          <span className="priority-range-line" aria-hidden="true" />
          {program && <Marker band={program} score={score} placement="bottom" />}
        </div>
        <div className="priority-range-scale">
          <span>{Math.round(portfolio.min)}</span>
          <span>Priority score {Math.round(score)}</span>
          <span>{Math.round(portfolio.max)}</span>
        </div>
        {!program && <p className="muted priority-range-note">No program assigned yet, so there is no program comparison.</p>}
      </div>
    </div>
  );
}
