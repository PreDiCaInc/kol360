'use client';

import { useState, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

interface ScoreRangeFilterProps {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  className?: string;
}

export function ScoreRangeFilter({
  label,
  min = 0,
  max = 100,
  step = 1,
  value,
  onChange,
  className,
}: ScoreRangeFilterProps) {
  // Local state for smooth interaction
  const [localValue, setLocalValue] = useState(value);

  const handleValueChange = useCallback((newValue: number[]) => {
    setLocalValue(newValue as [number, number]);
  }, []);

  const handleValueCommit = useCallback(
    (newValue: number[]) => {
      onChange(newValue as [number, number]);
    },
    [onChange]
  );

  // Check if filter is active (not at default range)
  const isActive = localValue[0] > min || localValue[1] < max;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <label className={cn('text-xs', isActive ? 'font-medium text-primary' : 'text-muted-foreground')}>
          {label}
        </label>
        <span className={cn('text-xs font-mono', isActive ? 'text-primary' : 'text-muted-foreground')}>
          {localValue[0]} - {localValue[1]}
        </span>
      </div>
      <Slider
        value={localValue}
        min={min}
        max={max}
        step={step}
        onValueChange={handleValueChange}
        onValueCommit={handleValueCommit}
      />
    </div>
  );
}

interface ScoreFiltersGridProps {
  filters: {
    scorePublicationsMin?: number;
    scorePublicationsMax?: number;
    scoreTradePubsMin?: number;
    scoreTradePubsMax?: number;
    scoreOrgLeadershipMin?: number;
    scoreOrgLeadershipMax?: number;
    scoreOrgAwardsMin?: number;
    scoreOrgAwardsMax?: number;
    scoreClinicalTrialsMin?: number;
    scoreClinicalTrialsMax?: number;
    scoreConferenceMin?: number;
    scoreConferenceMax?: number;
    scoreSocialMediaMin?: number;
    scoreSocialMediaMax?: number;
    scoreMediaPodcastsMin?: number;
    scoreMediaPodcastsMax?: number;
    scoreSurveyMin?: number;
    scoreSurveyMax?: number;
    compositeScoreMin?: number;
    compositeScoreMax?: number;
  };
  onChange: (key: string, min: number, max: number) => void;
}

const SCORE_FILTERS = [
  { key: 'compositeScore', label: 'Total Weighted Score', color: 'text-yellow-600' },
  { key: 'scoreSurvey', label: 'Survey Score', color: 'text-red-500' },
  { key: 'scorePublications', label: 'Publications', color: 'text-blue-500' },
  { key: 'scoreTradePubs', label: 'Trade Pubs', color: 'text-green-500' },
  { key: 'scoreOrgLeadership', label: 'Org Leadership', color: 'text-purple-500' },
  { key: 'scoreOrgAwards', label: 'Org Awards', color: 'text-orange-500' },
  { key: 'scoreClinicalTrials', label: 'Clinical Trials', color: 'text-cyan-500' },
  { key: 'scoreConference', label: 'Conference', color: 'text-emerald-500' },
  { key: 'scoreSocialMedia', label: 'Social Media', color: 'text-pink-500' },
  { key: 'scoreMediaPodcasts', label: 'Media/Podcasts', color: 'text-indigo-500' },
];

export function ScoreFiltersGrid({ filters, onChange }: ScoreFiltersGridProps) {
  const handleChange = (key: string) => (value: [number, number]) => {
    onChange(key, value[0], value[1]);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-muted/30 rounded-lg">
      {SCORE_FILTERS.map(({ key, label }) => {
        const minKey = `${key}Min` as keyof typeof filters;
        const maxKey = `${key}Max` as keyof typeof filters;
        const minValue = filters[minKey] ?? 0;
        const maxValue = filters[maxKey] ?? 100;

        return (
          <ScoreRangeFilter
            key={key}
            label={label}
            value={[minValue, maxValue]}
            onChange={handleChange(key)}
          />
        );
      })}
    </div>
  );
}
