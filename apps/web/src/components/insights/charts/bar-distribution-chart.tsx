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

interface BarDataItem {
  name: string;
  value: number;
}

interface BarDistributionChartProps {
  data: BarDataItem[];
  title?: string;
  color?: string;
}

export function BarDistributionChart({ data, title, color = '#2563EB' }: BarDistributionChartProps) {
  // Filter out items with empty names or zero values
  const filtered = data.filter((d) => d.name && d.name.trim() !== '' && d.value > 0);

  if (!filtered.length) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  // Check if labels are long (needs angled or truncated)
  const maxLabelLength = Math.max(...filtered.map((d) => d.name.length));
  const needsAngle = maxLabelLength > 15 || filtered.length > 8;

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={filtered} margin={{ top: 25, right: 10, left: 10, bottom: needsAngle ? 60 : 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fontWeight: 500 }}
          angle={needsAngle ? -35 : 0}
          textAnchor={needsAngle ? 'end' : 'middle'}
          height={needsAngle ? 80 : 30}
          tickFormatter={(value: string) =>
            value.length > 25 ? value.substring(0, 22) + '...' : value
          }
        />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
        <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} barSize={44}>
          <LabelList dataKey="value" position="top" style={{ fontSize: 12, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
