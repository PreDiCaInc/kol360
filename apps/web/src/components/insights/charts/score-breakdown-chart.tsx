'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

interface ScoreItem {
  label: string;
  value: number | null;
  color: string;
}

interface ScoreBreakdownChartProps {
  scores: ScoreItem[];
}

// More saturated, vibrant palette
const VIBRANT_COLORS = [
  '#2563EB', '#0D9488', '#CA8A04', '#EA580C', '#0891B2',
  '#059669', '#DB2777', '#4F46E5', '#DC2626',
];

export function ScoreBreakdownChart({ scores }: ScoreBreakdownChartProps) {
  const data = scores.map((s, i) => ({
    name: s.label,
    value: s.value ?? 0,
    color: VIBRANT_COLORS[i % VIBRANT_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 10, right: 50, top: 5, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickCount={6} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 12, fontWeight: 500 }} />
        <Tooltip
          formatter={(value) => [(Number(value) || 0).toFixed(1), 'Score']}
          contentStyle={{ borderRadius: 8, fontSize: 13 }}
        />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
          <LabelList dataKey="value" position="right" formatter={(v) => (Number(v) || 0).toFixed(1)} style={{ fontSize: 12, fontWeight: 600 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
