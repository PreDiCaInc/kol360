'use client';

import { useState } from 'react';
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
import { BarChart3, Table2 } from 'lucide-react';

interface StateDataItem {
  name: string;
  count: number;
}

interface StateBarChartProps {
  data: StateDataItem[];
  title?: string;
}

export function StateBarChart({ data, title }: StateBarChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');

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
    <div>
      {/* Toggle */}
      <div className="flex justify-end mb-2">
        <div className="inline-flex rounded-md border border-input bg-muted/30 p-0.5">
          <button
            onClick={() => setView('chart')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'chart' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            Chart
          </button>
          <button
            onClick={() => setView('table')}
            className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              view === 'table' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Table2 className="h-3.5 w-3.5" />
            Table
          </button>
        </div>
      </div>

      {view === 'chart' ? (
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
      ) : (
        <div className="rounded-md border max-h-[400px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Name</th>
                <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Count</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, i) => (
                <tr key={s.name} className="border-b last:border-b-0 hover:bg-muted/30">
                  <td className="px-3 py-1.5 text-muted-foreground">{i + 1}</td>
                  <td className="px-3 py-1.5">{s.name}</td>
                  <td className="px-3 py-1.5 font-mono text-right font-semibold">{s.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
