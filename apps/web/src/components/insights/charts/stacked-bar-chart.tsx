'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

interface StackedBarItem {
  resource: string;
  rank1: number;
  rank2: number;
  rank3: number;
  rank4: number;
  rank5: number;
}

interface StackedBarChartProps {
  data: StackedBarItem[];
  title?: string;
}

const RANK_COLORS = {
  rank1: '#16A34A', // Vivid green - most preferred
  rank2: '#65A30D', // Lime
  rank3: '#CA8A04', // Amber
  rank4: '#EA580C', // Orange
  rank5: '#DC2626', // Red - least preferred
};

const RANK_LABELS: Record<string, string> = {
  rank1: 'Rank 1',
  rank2: 'Rank 2',
  rank3: 'Rank 3',
  rank4: 'Rank 4',
  rank5: 'Rank 5',
};

export function StackedBarChart({ data, title }: StackedBarChartProps) {
  if (!data.length) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  // v1.17.26: room for the long Educational Resources labels.
  //   - Per-row height bumped 40 → 64 (Recharts wraps long category
  //     labels into 2-3 lines; 40px overlapped bars and adjacent rows).
  //   - Y-axis label column widened 180 → 280 so labels like "Medical
  //     education conferences (i.e., AAO, ASCRS, AOA)" mostly fit on a
  //     single wrapped line instead of three.
  //   - Custom tick renders SVG <text> with up to 3 wrapped tspans;
  //     anchored at the row's vertical midpoint so the bar lines up
  //     with the middle of the label block, not the top.
  //   - interval={0} forces Recharts to render EVERY label.
  const chartHeight = Math.max(320, data.length * 64);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 12, right: 30, top: 8, bottom: 8 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="resource"
          width={280}
          interval={0}
          tick={<WrappedTick />}
        />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
        <Legend />
        {Object.entries(RANK_COLORS).map(([key, color]) => (
          <Bar
            key={key}
            dataKey={key}
            name={RANK_LABELS[key]}
            stackId="stack"
            fill={color}
            radius={key === 'rank5' ? [0, 4, 4, 0] : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Splits a long label into up to 3 lines of ~36 chars each, centered
// vertically around the Y-axis tick. Recharts passes payload + (x, y) of
// the tick's anchor point; we render <text><tspan>… lines so the
// browser doesn't have to do word-wrapping in SVG by itself.
function WrappedTick(props: { x?: number; y?: number; payload?: { value?: string } }) {
  const { x = 0, y = 0, payload } = props;
  const value = payload?.value ?? '';
  const lines = wrapLabel(value, 36, 3);
  const lineHeight = 14;
  // Start above the anchor so the block sits centered on the tick.
  const startDy = -((lines.length - 1) * lineHeight) / 2;
  return (
    <text x={x} y={y} textAnchor="end" fill="#374151" fontSize={12} fontWeight={500}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? startDy : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function wrapLabel(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current) lines.push(current);
  // Anything that didn't fit gets ellipsized onto the last line.
  if (lines.length === maxLines && words.length > lines.join(' ').split(/\s+/).length) {
    const last = lines[lines.length - 1];
    lines[lines.length - 1] = last.length > maxChars - 1 ? `${last.slice(0, maxChars - 1)}…` : `${last}…`;
  }
  return lines.length > 0 ? lines : [text];
}
