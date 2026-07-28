'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useEffect, useRef, useState } from 'react';

// More saturated, vibrant palette
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

/**
 * v2.0.3 — Zero-to-non-zero mount-key hook.
 *
 * Recharts' `ResponsiveContainer` measures its parent DOM element at
 * mount and passes the measurement down to `<Pie>` as an absolute
 * width/height. When the parent's laid-out width is 0 at that moment
 * (which happens whenever the pie mounts inside a subtree that hadn't
 * settled its width yet — e.g. a `<TabsContent>` transitioning from
 * hidden → visible on first click, or a `grid-cols-1 lg:grid-cols-2`
 * cell during hydration), Recharts logs
 *
 *   "The width(-1) and height(-1) of chart should be greater than 0..."
 *
 * and never emits the SVG. Bar charts self-heal on the next scale
 * change; pies don't (their fixed `innerRadius`/`outerRadius` geometry
 * doesn't force a re-render on parent resize).
 *
 * The prod-rel-4.1.56 fix (inline `style={{ width: '100%', minHeight: 288 }}`
 * on the pie wrapper in demographics-tab.tsx) + the v1.18.3 wrapper
 * cleanup (`<div className="w-full">` in chart-table-toggle.tsx) both
 * relied on the parent settling before the mount measurement — which
 * held on 4.1.56 but stopped holding by v2.0.2 (the Recharts 3.x /
 * Radix Tabs / Tailwind cascade timing shifted; the two guarded
 * wrappers are still in the tree, they just aren't sufficient on their
 * own anymore).
 *
 * This hook observes the pie's outer wrapper via `ResizeObserver`;
 * when width transitions from 0 → non-zero for the first time, it
 * bumps `mountKey`, forcing a fresh `<ResponsiveContainer>` mount that
 * now measures a properly-sized parent. Purely additive: if the parent
 * happens to already be sized on first paint (already-visible tab,
 * cached client-side navigation), the observer fires once with width
 * > 0, sets the flag, and no remount happens.
 *
 * See docs/findings/prod-rel-5.0.2-post-soak-notes-2026-07-26.md #F5.
 */
function useZeroToNonZeroKey(): [
  React.MutableRefObject<HTMLDivElement | null>,
  number,
] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [mountKey, setMountKey] = useState(0);
  const wasNonZero = useRef(false);

  useEffect(() => {
    if (!ref.current || typeof ResizeObserver === 'undefined') return;
    const el = ref.current;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0 && !wasNonZero.current) {
        wasNonZero.current = true;
        setMountKey((k) => k + 1);
      } else if (w === 0 && wasNonZero.current) {
        // If the parent collapses back to 0 (e.g. tab hidden), reset
        // the latch so the next 0→N transition re-remounts.
        wasNonZero.current = false;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, mountKey];
}

export function PieDistributionChart({ data, title }: PieDistributionChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const [wrapperRef, mountKey] = useZeroToNonZeroKey();

  if (!data.length || total === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="w-full h-full">
      <ResponsiveContainer key={mountKey} width="100%" height="100%">
        <PieChart>
          {title && (
            <text x="50%" y="16" textAnchor="middle" className="text-sm font-medium fill-current">
              {title}
            </text>
          )}
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            label={({ name, percent }) =>
              `${name} (${((percent || 0) * 100).toFixed(0)}%)`
            }
            labelLine={{ strokeWidth: 1 }}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
                stroke="white"
                strokeWidth={2}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => {
              const num = Number(value) || 0;
              return [
                `${num} (${total > 0 ? ((num / total) * 100).toFixed(1) : 0}%)`,
                'Count',
              ];
            }}
            contentStyle={{ borderRadius: 8, fontSize: 13 }}
          />
          <Legend verticalAlign="bottom" height={36} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
