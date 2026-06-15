'use client';

interface HeatMapCellProps {
  value: number;
  maxValue: number;
  color?: string;
}

export function HeatMapCell({ value, maxValue, color }: HeatMapCellProps) {
  const intensity = maxValue > 0 ? Math.min(value / maxValue, 1) : 0;

  // Vivid emerald gradient: light mint to rich emerald
  // hsl(152, 82%, L%) where L goes from 94% (very light mint) to 30% (deep emerald)
  const lightness = 94 - intensity * 64;
  const saturation = 60 + intensity * 22; // more saturated at high values
  const bgColor = color || `hsl(152, ${saturation}%, ${lightness}%)`;
  const textColor = intensity > 0.5 ? 'white' : intensity > 0.25 ? '#064e3b' : 'inherit';
  const fontWeight = intensity > 0.5 ? 700 : intensity > 0.25 ? 600 : 400;

  return (
    // v1.17.41 — px-2 (tighter) so 7 category columns fit on
    // standard widths alongside the descriptor + sticky cols.
    <td
      className="px-2 py-2 text-sm text-center tabular-nums"
      style={{
        backgroundColor: intensity > 0 ? (color ? undefined : bgColor) : undefined,
        color: intensity > 0 ? textColor : undefined,
        fontWeight: intensity > 0 ? fontWeight : undefined,
      }}
    >
      {value}
    </td>
  );
}
