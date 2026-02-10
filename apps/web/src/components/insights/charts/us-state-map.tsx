'use client';

import { useState, useMemo, useCallback } from 'react';
import { ComposableMap, Geographies, Geography, ZoomableGroup } from 'react-simple-maps';
import { Tooltip } from '@/components/ui/tooltip';
import { TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

// TopoJSON URL for US states
const geoUrl = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

// FIPS code to state abbreviation mapping
const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY', '72': 'PR',
};

// State name mapping for display
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

interface StateData {
  name: string; // State abbreviation (e.g., "CA", "NY")
  count: number;
  percentage: number;
}

interface UsStateMapProps {
  data: StateData[];
  colorScale?: 'blue' | 'green' | 'purple';
  title?: string;
}

// Color scales for the choropleth
const COLOR_SCALES = {
  blue: {
    empty: '#f1f5f9', // slate-100
    range: ['#dbeafe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb', '#1d4ed8'], // blue-100 to blue-700
  },
  green: {
    empty: '#f1f5f9',
    range: ['#dcfce7', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d'],
  },
  purple: {
    empty: '#f1f5f9',
    range: ['#f3e8ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea', '#7e22ce'],
  },
};

export function UsStateMap({
  data,
  colorScale = 'blue',
  title,
}: UsStateMapProps) {
  const [tooltipContent, setTooltipContent] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });

  // Create lookup map for state data
  const stateDataMap = useMemo(() => {
    const map = new Map<string, StateData>();
    data.forEach((d) => {
      map.set(d.name.toUpperCase(), d);
    });
    return map;
  }, [data]);

  // Calculate max count for color scaling
  const maxCount = useMemo(() => {
    return Math.max(...data.map((d) => d.count), 1);
  }, [data]);

  // Get color for a count value
  const getColor = useCallback(
    (count: number): string => {
      const scale = COLOR_SCALES[colorScale];
      if (count === 0) return scale.empty;

      // Normalize count to 0-1 range
      const normalized = count / maxCount;

      // Map to color range index
      const index = Math.min(
        Math.floor(normalized * scale.range.length),
        scale.range.length - 1
      );

      return scale.range[index];
    },
    [colorScale, maxCount]
  );

  // Handle mouse events for tooltip
  const handleMouseEnter = useCallback(
    (geo: { id: string }, event: React.MouseEvent) => {
      const stateAbbr = FIPS_TO_STATE[geo.id];
      if (!stateAbbr) return;

      const stateData = stateDataMap.get(stateAbbr);
      const stateName = STATE_NAMES[stateAbbr] || stateAbbr;
      const count = stateData?.count ?? 0;
      const percentage = stateData?.percentage ?? 0;

      setTooltipContent(`${stateName}: ${count} (${percentage.toFixed(1)}%)`);
      setTooltipPosition({ x: event.clientX, y: event.clientY });
    },
    [stateDataMap]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipContent(null);
  }, []);

  // Legend items
  const legendItems = useMemo(() => {
    const scale = COLOR_SCALES[colorScale];
    const step = maxCount / scale.range.length;
    return scale.range.map((color, i) => ({
      color,
      min: Math.round(i * step),
      max: i === scale.range.length - 1 ? maxCount : Math.round((i + 1) * step - 1),
    }));
  }, [colorScale, maxCount]);

  return (
    <div className="relative">
      {title && (
        <h3 className="text-sm font-medium text-muted-foreground mb-2">{title}</h3>
      )}

      <div className="relative w-full h-[300px] bg-background rounded-md border">
        <ComposableMap
          projection="geoAlbersUsa"
          projectionConfig={{
            scale: 900,
          }}
          style={{ width: '100%', height: '100%' }}
        >
          <Geographies geography={geoUrl}>
            {({ geographies }) =>
              geographies.map((geo) => {
                const stateAbbr = FIPS_TO_STATE[geo.id];
                const stateData = stateDataMap.get(stateAbbr || '');
                const count = stateData?.count ?? 0;
                const fillColor = getColor(count);

                return (
                  <Geography
                    key={geo.rsmKey}
                    geography={geo}
                    fill={fillColor}
                    stroke="#94a3b8"
                    strokeWidth={0.5}
                    style={{
                      default: { outline: 'none' },
                      hover: {
                        fill: '#fbbf24',
                        outline: 'none',
                        cursor: 'pointer',
                      },
                      pressed: { outline: 'none' },
                    }}
                    onMouseEnter={(event) => handleMouseEnter(geo, event)}
                    onMouseLeave={handleMouseLeave}
                  />
                );
              })
            }
          </Geographies>
        </ComposableMap>

        {/* Tooltip */}
        {tooltipContent && (
          <div
            className="fixed z-50 px-3 py-2 text-sm bg-popover text-popover-foreground shadow-md rounded-md border pointer-events-none"
            style={{
              left: tooltipPosition.x + 10,
              top: tooltipPosition.y + 10,
            }}
          >
            {tooltipContent}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-1 mt-3">
        <span className="text-xs text-muted-foreground mr-1">0</span>
        {legendItems.map((item, i) => (
          <div
            key={i}
            className="w-6 h-3 rounded-sm"
            style={{ backgroundColor: item.color }}
            title={`${item.min} - ${item.max}`}
          />
        ))}
        <span className="text-xs text-muted-foreground ml-1">{maxCount}</span>
      </div>
    </div>
  );
}
