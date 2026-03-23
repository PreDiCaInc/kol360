'use client';

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

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

export function PieDistributionChart({ data, title }: PieDistributionChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  if (!data.length || total === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        No data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
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
  );
}
