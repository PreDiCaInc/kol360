'use client';

/**
 * v2.0.4 — inline-SVG donut chart. No Recharts.
 *
 * Background: 4 prior attempts (4.1.56 wrappers → 5.0.3 hook → 5.0.4 gate →
 * 5.0.4 observer-only) all failed to close the Demographics "Respondent Role"
 * pie regression. Root cause per pteam's late-day diagnostic
 * (docs/findings/prod-rel-5.0.3-pie-fix-didnt-take-2026-07-28.md, §UPDATE):
 * a React 18 hydration bailout caused by an invalid `<button>`-in-`<button>`
 * in TabHelpPopover was creating a chaotic re-render cycle that no
 * Recharts measurement fix could reliably survive.
 *
 * Pteam decision: swap this specific pie to hand-rolled inline SVG. Fixed
 * viewBox, no ResponsiveContainer, no measurement, no lifecycle. Renders
 * identically on server + client → hydration is a no-op. Total data is
 * usually 2-4 slices — the visualization is trivial and doesn't warrant a
 * chart library. Bar charts on the same tab still use Recharts and render
 * fine; this swap is surgical to one component.
 *
 * Public interface preserved: `PieDistributionChart` still accepts
 * `{name, value, color?}[]` + optional `title`. Percentages computed
 * internally from `value`. Callers unchanged (demographics-tab.tsx,
 * kol-explorer.tsx).
 */

const DEFAULT_COLORS = [
  '#2563EB', '#059669', '#D97706', '#DC2626', '#7C3AED',
  '#0891B2', '#DB2777', '#65A30D', '#EA580C', '#4F46E5',
];

interface PieDataItem {
  name: string;
  value: number;
  color?: string;
  [key: string]: string | number | undefined;
}

interface PieDistributionChartProps {
  data: PieDataItem[];
  title?: string;
}

const SIZE = 240;
const OUTER_RADIUS = 100;
const INNER_RADIUS = 55;
const CX = SIZE / 2;
const CY = SIZE / 2;

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function donutSlicePath(
  startAngle: number,
  endAngle: number,
  outerR: number,
  innerR: number,
): string {
  const p1 = polarToCartesian(CX, CY, outerR, startAngle);
  const p2 = polarToCartesian(CX, CY, outerR, endAngle);
  const p3 = polarToCartesian(CX, CY, innerR, endAngle);
  const p4 = polarToCartesian(CX, CY, innerR, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    'Z',
  ].join(' ');
}

export function PieDistributionChart({ data, title }: PieDistributionChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (!data.length || total === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  let cumulative = 0;
  const slices = data.map((d, i) => {
    const percentage = (d.value / total) * 100;
    const startAngle = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
    cumulative += percentage;
    const endAngle = (cumulative / 100) * 2 * Math.PI - Math.PI / 2;
    const color = d.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
    return {
      name: d.name,
      value: d.value,
      percentage,
      color,
      d: donutSlicePath(startAngle, endAngle, OUTER_RADIUS, INNER_RADIUS),
    };
  });

  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 py-2">
      {title && (
        <div className="text-sm font-medium text-center">{title}</div>
      )}
      <div className="flex flex-row items-center gap-8">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="w-52 h-52 shrink-0"
          role="img"
          aria-label={title || 'Distribution'}
        >
          {slices.map((s, i) => (
            <path
              key={`slice-${i}`}
              d={s.d}
              fill={s.color}
              stroke="white"
              strokeWidth={2}
            >
              <title>{`${s.name}: ${s.value} (${s.percentage.toFixed(1)}%)`}</title>
            </path>
          ))}
        </svg>
        <ul className="text-sm space-y-1.5">
          {slices.map((s, i) => (
            <li key={`legend-${i}`} className="flex items-center gap-2">
              <span
                className="inline-block w-3 h-3 rounded-sm shrink-0"
                style={{ background: s.color }}
              />
              <span className="text-foreground">
                {s.name}{' '}
                <span className="text-muted-foreground">
                  ({s.percentage.toFixed(1)}%)
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
