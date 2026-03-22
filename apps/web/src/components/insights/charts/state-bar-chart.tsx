'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';

interface StateDataItem {
  name: string;
  count: number;
}

interface StateBarChartProps {
  data: StateDataItem[];
  title?: string;
}

export function StateBarChart({ data, title }: StateBarChartProps) {
  // Sort by count desc, filter out empty/unnamed items, show top 20
  const sorted = [...data]
    .filter((d) => d.name && d.name.trim() !== '' && d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  if (!sorted.length) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  // Calculate label width based on longest name
  const maxLabelLength = Math.max(...sorted.map((d) => d.name.length));
  const labelWidth = Math.min(280, Math.max(60, maxLabelLength * 7));
  const chartHeight = Math.max(300, sorted.length * 32);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={sorted} layout="vertical" margin={{ left: 10, right: 50, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis
          type="category"
          dataKey="name"
          width={labelWidth}
          tick={{ fontSize: 11, fontWeight: 500 }}
          tickFormatter={(value: string) =>
            value.length > 40 ? value.substring(0, 37) + '...' : value
          }
        />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
        <Bar dataKey="count" fill="#2563EB" radius={[0, 6, 6, 0]} barSize={20}>
          <LabelList dataKey="count" position="right" style={{ fontSize: 12, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
