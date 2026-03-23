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

interface NominationItem {
  type: string;
  count: number;
  color: string;
}

interface NominationCountsChartProps {
  nominations: NominationItem[];
}

// More saturated colors
const VIBRANT_NOMINATION_COLORS = [
  '#2563EB', '#059669', '#7C3AED', '#D97706', '#DB2777', '#0891B2',
];

export function NominationCountsChart({ nominations }: NominationCountsChartProps) {
  const data = nominations.map((n, i) => ({
    name: n.type,
    value: n.count,
    color: VIBRANT_NOMINATION_COLORS[i % VIBRANT_NOMINATION_COLORS.length],
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 25, right: 10, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 12, fontWeight: 500 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 13 }} />
        <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={44}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
          <LabelList dataKey="value" position="top" style={{ fontSize: 13, fontWeight: 700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
