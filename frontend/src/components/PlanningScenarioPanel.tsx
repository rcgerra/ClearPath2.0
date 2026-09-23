import { useState } from 'react';
import { weekLabelShort } from '../utils/arrayParser';
import type { AllocationConflict } from '../utils/allocationRisk';
import SlideOverPanel from './SlideOverPanel';

export interface ScenarioAdjustmentRow {
  id: string;
  label: string;
  subtitle?: string;
  weeks: number[];
}

export type ScenarioWeekOverrides = Record<string, Record<number, number>>;

export default function PlanningScenarioPanel({
  active,
  title,
  description,
  valueLabel,
  horizon,
  rows,
  overrides,
  baselineConflicts,
  scenarioConflicts,
  isApplying,
  onStart,
  onWeekValue,
  onDiscard,
  onApply,
}: {
  active: boolean;
  title: string;
  description: string;
  valueLabel: string;
  horizon: number;
  rows: ScenarioAdjustmentRow[];
  overrides: ScenarioWeekOverrides;
  baselineConflicts: AllocationConflict[];
  scenarioConflicts: AllocationConflict[];
  isApplying: boolean;
  onStart: () => void;
  onWeekValue: (id: string, week: number, value: number) => void;
  onDiscard: () => void;
  onApply: () => void;
}) {
  const [selectedRowId, setSelectedRowId] = useState('');
  if (!active) {
    return (
      <section className="planning-scenario-launch">
        <div><h3>{title}</h3><p>{description}</p></div>
        <button type="button" onClick={onStart}>Start what-if scenario</button>
      </section>
    );
  }

  const selected = rows.find((row) => row.id === selectedRowId) ?? rows[0];
  const selectedOverrides = selected ? overrides[selected.id] ?? {} : {};
  const changedRows = Object.values(overrides).filter((weekValues) => Object.keys(weekValues).length > 0).length;
  const baselineIds = new Set(baselineConflicts.map((conflict) => conflict.personId));
  const scenarioIds = new Set(scenarioConflicts.map((conflict) => conflict.personId));
  const resolved = baselineConflicts.filter((conflict) => !scenarioIds.has(conflict.personId));
  const introduced = scenarioConflicts.filter((conflict) => !baselineIds.has(conflict.personId));
  const persisting = scenarioConflicts.filter((conflict) => baselineIds.has(conflict.personId));
  const baselineExcess = baselineConflicts.reduce((sum, conflict) => sum + conflict.totalOver, 0);
  const scenarioExcess = scenarioConflicts.reduce((sum, conflict) => sum + conflict.totalOver, 0);
  const baselineConflict = selected ? baselineConflicts.find((conflict) => conflict.personId === selected.id) : undefined;
  const scenarioConflict = selected ? scenarioConflicts.find((conflict) => conflict.personId === selected.id) : undefined;
  const outcome = scenarioConflict
    ? baselineConflict
      ? scenarioConflict.totalOver < baselineConflict.totalOver ? 'Improved' : scenarioConflict.totalOver > baselineConflict.totalOver ? 'Worsened' : 'Unchanged'
      : 'Introduced'
    : baselineConflict ? 'Resolved' : 'Clear';
  const columns = Array.from({ length: horizon }, (_, week) => week);

  return (
    <SlideOverPanel
      open={active}
      onClose={onDiscard}
      size="wide"
      title={title}
      subtitle={<><span className="planning-scenario-label">Draft scenario · live data unchanged</span> {description}</>}
      headerActions={
        <>
          <button type="button" onClick={onDiscard} disabled={isApplying}>Discard</button>
          <button
            type="button"
            className="primary"
            disabled={isApplying || changedRows === 0}
            onClick={() => {
              if (window.confirm(`Apply this scenario to ${changedRows} live planning record${changedRows === 1 ? '' : 's'}?`)) onApply();
            }}
          >
            {isApplying ? 'Applying\u2026' : 'Apply scenario'}
          </button>
        </>
      }
    >
      <div className="scenario-comparison" aria-label="Scenario conflict comparison">
        <div><strong>{baselineConflicts.length}</strong><span>Baseline conflicts</span></div>
        <div><strong>{scenarioConflicts.length}</strong><span>Scenario conflicts</span></div>
        <div><strong>{Math.round(baselineExcess).toLocaleString('en-US')} h</strong><span>Baseline excess</span></div>
        <div className={scenarioExcess < baselineExcess ? 'scenario-resolved' : scenarioExcess > baselineExcess ? 'scenario-introduced' : undefined}>
          <strong>{Math.round(scenarioExcess).toLocaleString('en-US')} h</strong><span>Scenario excess</span>
        </div>
        <div className="scenario-resolved"><strong>{resolved.length}</strong><span>Resolved</span></div>
        <div className={introduced.length ? 'scenario-introduced' : undefined}><strong>{introduced.length}</strong><span>Introduced</span></div>
        <div><strong>{persisting.length}</strong><span>Persisting</span></div>
      </div>

      {selected ? (
        <>
          <div className="scenario-person-toolbar">
            <label>
              Person
              <select value={selected.id} onChange={(event) => setSelectedRowId(event.target.value)}>
                {rows.map((row) => <option key={row.id} value={row.id}>{row.label}{row.subtitle ? ` \u00b7 ${row.subtitle}` : ''}</option>)}
              </select>
            </label>
            <span className={`scenario-outcome scenario-outcome-${outcome.toLowerCase()}`}>{outcome}</span>
            <span className="muted">Edit scenario values week by week; baseline values remain visible for comparison.</span>
          </div>
          <div className="matrix-scroll scenario-weekly-scroll">
            <table className="weekly-matrix scenario-weekly-matrix">
              <thead><tr><th className="matrix-label">{valueLabel}</th>{columns.map((week) => <th key={week}>{weekLabelShort(week)}</th>)}</tr></thead>
              <tbody>
                <tr><th className="matrix-label" scope="row">Baseline</th>{columns.map((week) => <td key={week}>{selected.weeks[week] ?? 0}</td>)}</tr>
                <tr className="scenario-weekly-edit-row">
                  <th className="matrix-label" scope="row">Scenario</th>
                  {columns.map((week) => {
                    const baseline = selected.weeks[week] ?? 0;
                    const changed = Object.prototype.hasOwnProperty.call(selectedOverrides, week);
                    return (
                      <td key={week} className={changed ? 'scenario-cell-changed' : undefined}>
                        <input
                          type="number"
                          min={0}
                          max={99}
                          step={1}
                          value={selectedOverrides[week] ?? baseline}
                          aria-label={`${valueLabel} scenario for ${selected.label}, week of ${weekLabelShort(week)}`}
                          onFocus={(event) => event.target.select()}
                          onChange={(event) => onWeekValue(selected.id, week, Math.max(0, Math.min(99, Math.round(Number(event.target.value) || 0))))}
                        />
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="muted">No planning rows are available for this scenario.</p>}
    </SlideOverPanel>
  );
}