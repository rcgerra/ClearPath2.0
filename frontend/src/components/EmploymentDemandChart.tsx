import { useEffect, useRef, useState } from 'react';
import { weekLabelShort } from '../utils/arrayParser';

interface Props {
  weeks: number;
  fteDemand: number[];
  contractorDemand: number[];
  availability: number[];
  height?: number;
}

const PAD_TOP = 26;
const PAD_BOTTOM = 34;
const PAD_LEFT = 10;

/** Weekly FTE/contractor demand stacked against total team availability. */
export default function EmploymentDemandChart({ weeks, fteDemand, contractorDemand, availability, height = 220 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const contractorColor = 'var(--sorairo-blue)';
  const fteColor = 'var(--matsuba-green)';

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setContainerWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const colWidth = containerWidth > 0 ? Math.max(4, (containerWidth - PAD_LEFT - 12) / weeks) : 16;
  const width = PAD_LEFT + weeks * colWidth + 12;
  const plotHeight = height - PAD_TOP - PAD_BOTTOM;
  const scale = (value: number, index: number) => (value / Math.max(1, availability[index] ?? 0)) * plotHeight;
  const labelEvery = weeks > 60 ? 8 : 4;

  return (
    <div className="chart-scroll" ref={containerRef}>
      <svg width={width} height={height} role="img" aria-label="Weekly demand by employment type against total availability">
        {Array.from({ length: weeks }, (_, index) => {
          const x = PAD_LEFT + index * colWidth + 2;
          const barWidth = Math.max(1, colWidth - 4);
          const available = availability[index] ?? 0;
          const fte = fteDemand[index] ?? 0;
          const contractor = contractorDemand[index] ?? 0;
          const fteHeight = scale(fte, index);
          const contractorHeight = scale(contractor, index);
          const totalHeight = fteHeight + contractorHeight;
          const baseY = PAD_TOP + plotHeight;
          const capacityY = baseY - plotHeight;
          return (
            <g key={index}>
              <line x1={x - 1} x2={x + barWidth + 1} y1={capacityY} y2={capacityY} className="employment-capacity-line" />
              {fte > 0 && <rect x={x} y={baseY - fteHeight} width={barWidth} height={fteHeight} fill={fteColor}><title>{`FTE demand: ${fte} h`}</title></rect>}
              {contractor > 0 && <rect x={x} y={baseY - totalHeight} width={barWidth} height={contractorHeight} fill={contractorColor}><title>{`Contractor demand: ${contractor} h`}</title></rect>}
              {totalHeight > 0 && <text x={x + barWidth / 2} y={baseY - totalHeight - 4} className="chart-value-label" textAnchor="middle">{Math.round(fte + contractor)}</text>}
              {available > 0 && <text x={x + barWidth / 2} y={capacityY - 4} className="chart-availability-label" textAnchor="middle">{Math.round(available)}</text>}
              {index % labelEvery === 0 && <text x={x + barWidth / 2} y={height - PAD_BOTTOM + 16} className="chart-axis-label" textAnchor="middle">{weekLabelShort(index)}</text>}
            </g>
          );
        })}
        <line x1={PAD_LEFT} x2={width - 6} y1={PAD_TOP + plotHeight} y2={PAD_TOP + plotHeight} className="chart-axis" />
      </svg>
      <div className="chart-legend team-chart-legend">
        <span className="legend-entry"><span className="legend-swatch" style={{ background: fteColor }} /> FTE demand</span>
        <span className="legend-entry"><span className="legend-swatch" style={{ background: contractorColor }} /> Contractor demand</span>
        <span className="legend-entry"><span className="legend-swatch availability" /> Total availability</span>
      </div>
    </div>
  );
}
