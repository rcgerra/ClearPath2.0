import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { prioritizationApi } from '../api/client';
import DataTable, { Column } from './admin/DataTable';
import ListToolbar from './admin/ListToolbar';
import type { RankedRequest } from '../types';

const QUARTILES = ['Highest quartile', 'Upper-middle quartile', 'Lower-middle quartile', 'Lowest quartile'];
const CHART_WIDTH = 720;
const CHART_HEIGHT = 430;
const PADDING = { top: 28, right: 28, bottom: 54, left: 56 };

function score(value: number | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0;
}

function bubbleValue(request: RankedRequest): number {
  return score(request.financialBenefit ?? request.priorityScore);
}

export default function PrioritizationAnalytics() {
  const ranking = useQuery({ queryKey: ['ranking'], queryFn: prioritizationApi.ranking });
  const [tableView, setTableView] = useState<'topTen' | 0 | 1 | 2 | 3>('topTen');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rows = ranking.data ?? [];
  const topTen = rows.filter((row) => row.topTen).slice(0, 10);
  const averageScore = rows.length ? rows.reduce((total, row) => total + score(row.priorityScore), 0) / rows.length : 0;
  const quartileCounts = useMemo(() => QUARTILES.map((quartile) => ({ quartile, count: rows.filter((row) => row.quartile === quartile).length })), [rows]);
  const maxBubbleValue = Math.max(1, ...rows.map(bubbleValue));
  const plotWidth = CHART_WIDTH - PADDING.left - PADDING.right;
  const plotHeight = CHART_HEIGHT - PADDING.top - PADDING.bottom;
  const x = (value: number | undefined) => PADDING.left + (score(value) / 15) * plotWidth;
  const y = (value: number | undefined) => PADDING.top + plotHeight - (score(value) / 15) * plotHeight;
  const radius = (request: RankedRequest) => 7 + Math.sqrt(bubbleValue(request) / maxBubbleValue) * 19;
  const tableRows = tableView === 'topTen' ? topTen : rows.filter((row) => row.quartile === QUARTILES[tableView]);
  const filteredTableRows = tableRows.filter((row) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return [row.title, row.departmentName, row.categoryName, row.rank, row.quartile]
      .some((value) => String(value ?? '').toLowerCase().includes(term));
  });
  const tableTitle = tableView === 'topTen' ? 'Top 10 priority queue' : `${QUARTILES[tableView]} priority queue`;
  const tableSubtitle = tableView === 'topTen' ? 'Highest-ranked requests for portfolio attention.' : 'Requests in this quartile, with portfolio rank preserved.';
  const tableColumns: Column<RankedRequest>[] = [
    { key: 'rank', label: 'Rank', width: '92px', value: (row) => row.rank, render: (row) => <span className="prioritization-rank-cell">{row.topTen && <span className="prioritization-top-ten-icon" title="Top 10 priority">◆</span>}{row.rank}</span> },
    { key: 'title', label: 'Request', value: (row) => row.title, render: (row) => <strong>{row.title ?? 'Untitled request'}</strong> },
  ];

  return <section className="prioritization-analytics">
    <div className="prioritization-analytics-kpis">
      <div><strong>{rows.length}</strong><span>Ranked requests</span></div>
      <div><strong>{topTen.length}</strong><span>Top 10 requests</span></div>
      <div><strong>{quartileCounts[0]?.count ?? 0}</strong><span>Highest quartile</span></div>
      <div><strong>{averageScore.toFixed(2)}</strong><span>Average score</span></div>
    </div>

    <div className="prioritization-analytics-grid">
      <section className="analytics-chart-panel prioritization-top-ten-panel">
        <div className="analytics-panel-heading"><div><h2>{tableTitle}</h2><p>{tableSubtitle}</p></div></div>
        <div className="prioritization-table-tabs" role="tablist" aria-label="Priority bands">
          <button type="button" role="tab" aria-selected={tableView === 'topTen'} className={tableView === 'topTen' ? 'active' : ''} onClick={() => setTableView('topTen')}>Top 10</button>
          {QUARTILES.map((quartile, index) => <button type="button" role="tab" aria-selected={tableView === index} className={tableView === index ? 'active' : ''} onClick={() => setTableView(index as 0 | 1 | 2 | 3)} key={quartile}>{quartile.replace(' quartile', '')} quartile</button>)}
        </div>
        <ListToolbar search={search} onSearch={setSearch} placeholder="Find a request, department, category, or rank…" />
        <DataTable rows={filteredTableRows} columns={tableColumns} getRowKey={(row) => row.id} initialSortKey="rank" isLoading={ranking.isLoading} emptyMessage="No requests match this priority band and search." onRowClick={(row) => setSelectedId(row.id)} getRowClassName={(row) => selectedId === row.id ? 'prioritization-row-selected' : undefined} />
      </section>

      <section className="analytics-chart-panel prioritization-bubble-panel">
        <div className="analytics-panel-heading"><div><h2>Impact versus Complexity</h2><p>Bubble size: financial benefit where captured; priority score proxy for current records.</p></div></div>
        <div className="prioritization-bubble-scroll">
          <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Portfolio bubble chart showing Impact versus Complexity with bubble size for financial benefit">
            {[0, 5, 10, 15].map((tick) => <g key={tick}><line x1={x(tick)} x2={x(tick)} y1={PADDING.top} y2={PADDING.top + plotHeight} className="chart-gridline" /><line x1={PADDING.left} x2={PADDING.left + plotWidth} y1={y(tick)} y2={y(tick)} className="chart-gridline" /><text x={x(tick)} y={CHART_HEIGHT - 20} className="chart-axis-label" textAnchor="middle">{tick}</text><text x={PADDING.left - 10} y={y(tick) + 4} className="chart-axis-label" textAnchor="end">{tick}</text></g>)}
            <line x1={PADDING.left} x2={PADDING.left + plotWidth} y1={PADDING.top + plotHeight} y2={PADDING.top + plotHeight} className="chart-axis" />
            <line x1={PADDING.left} x2={PADDING.left} y1={PADDING.top} y2={PADDING.top + plotHeight} className="chart-axis" />
            {rows.map((request) => <circle key={request.id} cx={x(request.impactScore)} cy={y(request.complexityScore)} r={radius(request)} className={`prioritization-bubble${request.topTen ? ' top-ten' : ''}${selectedId === request.id ? ' selected' : ''}`} opacity={selectedId && selectedId !== request.id ? 0.22 : 0.78}>
              <title>{`${request.rank}. ${request.title ?? 'Untitled request'} | Impact ${score(request.impactScore).toFixed(1)} | Complexity ${score(request.complexityScore).toFixed(1)} | Bubble value ${bubbleValue(request).toFixed(1)}`}</title>
            </circle>)}
            <text x={PADDING.left + plotWidth / 2} y={CHART_HEIGHT - 3} className="chart-axis-title" textAnchor="middle">Impact</text>
            <text x="15" y={PADDING.top + plotHeight / 2} className="chart-axis-title" textAnchor="middle" transform={`rotate(-90 15 ${PADDING.top + plotHeight / 2})`}>Complexity</text>
          </svg>
        </div>
        <div className="chart-legend"><span className="legend-entry"><span className="legend-swatch prioritization-legend-bubble" /> All ranked requests</span><span className="legend-entry"><span className="legend-swatch prioritization-legend-top-ten" /> Top 10</span></div>
      </section>
    </div>
  </section>;
}