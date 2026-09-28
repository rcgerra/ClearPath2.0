import { useEffect, useId, useRef, useState } from 'react';
import { weekLabel, weekLabelShort } from '../utils/arrayParser';

interface GapSeries {
  id: string;
  label: string;
  weeks: number[];
}

interface Props {
  series: GapSeries[];
  weeks: number;
}

const HEIGHT = 145;
const PAD_TOP = 16;
const PAD_BOTTOM = 30;
const PAD_LEFT = 36;

function gapPattern(id: string, index: number, color: string) {
  const spacing = 6 + Math.floor(index / 5) * 2;
  return (
    <pattern id={id} key={id} patternUnits="userSpaceOnUse" width={spacing} height={spacing}>
      <rect width={spacing} height={spacing} fill={color} />
      {index % 5 === 0 && <path d={`M0 0 H${spacing}`} stroke="white" strokeOpacity="0.7" strokeWidth="1.4" />}
      {index % 5 === 1 && <path d={`M0 ${spacing} L${spacing} 0`} stroke="white" strokeOpacity="0.7" strokeWidth="1.4" />}
      {index % 5 === 2 && <circle cx={spacing / 2} cy={spacing / 2} r="1.4" fill="white" fillOpacity="0.75" />}
      {index % 5 === 3 && <path d={`M0 0 V${spacing}`} stroke="white" strokeOpacity="0.7" strokeWidth="1.4" />}
      {index % 5 === 4 && <path d={`M0 0 L${spacing} ${spacing} M0 ${spacing} L${spacing} 0`} stroke="white" strokeOpacity="0.7" strokeWidth="1.2" />}
    </pattern>
  );
}

export default function CapacityGapChart({ series, weeks }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const chartId = useId().replace(/:/g, '');

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setSelectedSeriesId(null), [series]);

  if (series.length === 0) return <p className="home-empty-state">No departments in this view.</p>;

  const visibleSeries = series.map((item, index) => ({ item, index })).filter(({ item }) => !selectedSeriesId || item.id === selectedSeriesId);
  const groupWidth = Math.max(24, visibleSeries.length * 6, (Math.max(320, containerWidth) - PAD_LEFT - 14) / weeks);
  const width = PAD_LEFT + weeks * groupWidth + 14;
  const weekGap = Math.min(6, groupWidth * 0.15);
  const barWidth = (groupWidth - weekGap) / visibleSeries.length;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const values = visibleSeries.flatMap(({ item }) => item.weeks.slice(0, weeks));
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const range = maximum - minimum || 1;
  const y = (value: number) => PAD_TOP + ((maximum - value) / range) * plotHeight;
  const zeroY = y(0);

  return (
    <div className="home-gap-chart chart-scroll" ref={containerRef}>
      <svg width={width} height={HEIGHT} role="img" aria-label="Weekly capacity gap by department">
        <defs>
          {visibleSeries.flatMap(({ index }) => [
            gapPattern(`${chartId}-${index}-surplus`, index, '#267d55'),
            gapPattern(`${chartId}-${index}-deficit`, index, '#b43d43'),
          ])}
        </defs>
        <line x1={PAD_LEFT} x2={width - 14} y1={zeroY} y2={zeroY} className="chart-capacity-line" />
        <text x={PAD_LEFT - 7} y={zeroY + 4} textAnchor="end" className="chart-axis-label">0</text>
        {Array.from({ length: weeks }, (_, week) => week % 2 === 0 && (
          <text key={week} x={PAD_LEFT + (week + 0.5) * groupWidth} y={HEIGHT - 5} textAnchor="middle" className="chart-axis-label">{weekLabelShort(week)}</text>
        ))}
        {visibleSeries.map(({ item, index }, position) => (
          <g key={item.id}>
            {Array.from({ length: weeks }, (_, week) => {
              const gap = item.weeks[week] ?? 0;
              return (
                <rect
                  key={week}
                  x={PAD_LEFT + week * groupWidth + weekGap / 2 + position * barWidth + 0.5}
                  y={Math.min(zeroY, y(gap))}
                  width={Math.max(1, barWidth - 1)}
                  height={Math.abs(zeroY - y(gap))}
                  fill={`url(#${chartId}-${index}-${gap >= 0 ? 'surplus' : 'deficit'})`}
                >
                  <title>{`${item.label} · Week of ${weekLabel(week)} · ${Math.round(gap)} h capacity gap`}</title>
                </rect>
              );
            })}
          </g>
        ))}
      </svg>
      <div className="home-gap-legend">
        {series.map((item, index) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={selectedSeriesId === item.id}
            aria-label={selectedSeriesId === item.id ? 'Show all departments' : `Show only ${item.label}`}
            onClick={() => setSelectedSeriesId((current) => current === item.id ? null : item.id)}
          >
            <svg width="16" height="12" aria-hidden="true">
              <defs>{gapPattern(`${chartId}-${index}-legend`, index, '#267d55')}</defs>
              <rect width="16" height="12" fill={`url(#${chartId}-${index}-legend)`} />
            </svg>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}