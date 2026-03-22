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

  const chartHeight = Math.max(300, data.length * 40);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 20, right: 30, top: 5, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="resource"
          width={180}
          tick={{ fontSize: 12, fontWeight: 500 }}
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
