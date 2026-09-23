import { useMemo } from 'react';
import type { DemandRow, NonProjectDemandRow } from '../types';
import { weekValue } from '../utils/arrayParser';
import { formatCount } from '../utils/format';

interface Props {
  projectDemand: DemandRow[];
  nonProjectDemand: NonProjectDemandRow[];
}

type CategorySummary = {
  id: string;
  name: string;
  total: number;
};

type SankeyNode = {
  id: string;
  label: string;
  value: number;
  x: number;
  y: number;
  height: number;
  color: string;
};

const CHART_WIDTH = 760;
const CHART_HEIGHT = 400;
const NODE_WIDTH = 16;
const NODE_GAP = 10;
const NODE_TOP = 28;
const NODE_BOTTOM = 34;
const CHANGE_COLOR = 'var(--sorairo-blue)';
const RUN_COLOR = 'var(--asagi-blue)';
const CATEGORY_COLORS = ['var(--matsuba-green)', 'var(--azuki-maroon)', 'var(--sakura-pink)', 'var(--sorairo-blue)', 'var(--asagi-blue)'];

function accountingWindowTotal(row: { weeks: number[]; pastWeeks?: number[] }): number {
  let total = 0;
  for (let week = -39; week <= 12; week += 1) total += weekValue(row.weeks, week, row.pastWeeks);
  return total;
}

export default function SiteCapacityAnalytics({ projectDemand, nonProjectDemand }: Props) {
  const categories = useMemo<CategorySummary[]>(() => {
    const totals = new Map<string, CategorySummary>();
    const add = (id: string, name: string, total: number) => {
      const category = totals.get(id) ?? { id, name, total: 0 };
      category.total += total;
      totals.set(id, category);
    };
    for (const row of nonProjectDemand) add(row.categoryId ?? '__other-work__', row.categoryName ?? 'Other work', accountingWindowTotal(row));
    return Array.from(totals.values()).sort((first, second) => second.total - first.total);
  }, [nonProjectDemand]);

  const changeDemand = projectDemand.reduce((total, row) => total + accountingWindowTotal(row), 0);
  const runDemand = nonProjectDemand.reduce((total, row) => total + accountingWindowTotal(row), 0);
  const totalDemand = changeDemand + runDemand;
  const chartHeight = CHART_HEIGHT - NODE_TOP - NODE_BOTTOM;
  const scale = totalDemand > 0 ? chartHeight / totalDemand : 0;
  const nodeHeight = (value: number) => Math.max(value > 0 ? 2 : 0, value * scale);
  const nodes: SankeyNode[] = [];
  const totalNode: SankeyNode = { id: 'total', label: 'Total Demand', value: totalDemand, x: 38, y: NODE_TOP, height: nodeHeight(totalDemand), color: 'var(--matsuba-green)' };
  const changeNode: SankeyNode = { id: 'change', label: 'Change the Business', value: changeDemand, x: 280, y: NODE_TOP, height: nodeHeight(changeDemand), color: CHANGE_COLOR };
  const runNode: SankeyNode = { id: 'run', label: 'Run the Business', value: runDemand, x: 280, y: NODE_TOP + nodeHeight(changeDemand), height: nodeHeight(runDemand), color: RUN_COLOR };
  nodes.push(totalNode, changeNode, runNode);
  let categoryY = NODE_TOP;
  for (const [index, category] of categories.entries()) {
    const node = { id: category.id, label: category.name, value: category.total, x: 540, y: categoryY, height: nodeHeight(category.total), color: CATEGORY_COLORS[index % CATEGORY_COLORS.length] };
    nodes.push(node);
    categoryY += node.height + NODE_GAP;
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const linkPath = (source: SankeyNode, target: SankeyNode, sourceOffset: number, targetOffset: number, value: number) => {
    const height = nodeHeight(value);
    const sourceY = source.y + sourceOffset + height / 2;
    const targetY = target.y + targetOffset + height / 2;
    const startX = source.x + NODE_WIDTH;
    const endX = target.x;
    return `M ${startX} ${sourceY} C ${(startX + endX) / 2} ${sourceY}, ${(startX + endX) / 2} ${targetY}, ${endX} ${targetY}`;
  };
  let categoryOffset = 0;
  const categoryLinks = categories.map((category) => {
    const target = nodeById.get(category.id)!;
    const path = linkPath(runNode, target, categoryOffset, 0, category.total);
    categoryOffset += nodeHeight(category.total);
    return { category, target, path };
  });

  return (
    <div className="analytics-comparison-charts site-capacity-analytics">
      <section className="analytics-chart-panel">
        <h3>Demand flow</h3>
        <svg width="100%" viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label="Demand flow from total demand to change the business and run the business categories">
          <g className="sankey-links">
            {changeDemand > 0 && <path d={linkPath(totalNode, changeNode, 0, 0, changeDemand)} stroke={CHANGE_COLOR} strokeWidth={nodeHeight(changeDemand)} />}
            {runDemand > 0 && <path d={linkPath(totalNode, runNode, nodeHeight(changeDemand), 0, runDemand)} stroke={RUN_COLOR} strokeWidth={nodeHeight(runDemand)} />}
            {categoryLinks.map(({ category, path }) => <path key={category.id} d={path} stroke={RUN_COLOR} strokeWidth={nodeHeight(category.total)} />)}
          </g>
          {nodes.map((node) => (
            <g key={node.id}>
              <rect x={node.x} y={node.y} width={NODE_WIDTH} height={node.height} rx="2" fill={node.color} />
              <text x={node.x + NODE_WIDTH + 8} y={node.y + Math.max(12, node.height / 2)} className="sankey-node-label">{node.label}</text>
              <text x={node.x + NODE_WIDTH + 8} y={node.y + Math.max(24, node.height / 2 + 15)} className="sankey-node-value">{formatCount(node.value)}</text>
              <title>{`${node.label}: ${formatCount(node.value)} h`}</title>
            </g>
          ))}
          {totalDemand === 0 && <text x="38" y={NODE_TOP + 20} className="chart-axis-label">No demand data</text>}
        </svg>
        <div className="chart-legend team-chart-legend">
          <span className="legend-entry"><span className="legend-swatch" style={{ background: CHANGE_COLOR }} /> Change the Business</span>
          <span className="legend-entry"><span className="legend-swatch" style={{ background: RUN_COLOR }} /> Run the Business</span>
        </div>
      </section>
    </div>
  );
}
