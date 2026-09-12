/** Explains the row styling used across the admin tables. */
export default function RowLegend() {
  return (
    <div className="row-legend" aria-label="Row formatting key">
      <span className="legend-item legend-owner">Owner</span>
      <span className="legend-item legend-delegate">Delegate</span>
      <span className="legend-item legend-viewer">View only</span>
      <span className="legend-item legend-inactive">Inactive</span>
    </div>
  );
}
