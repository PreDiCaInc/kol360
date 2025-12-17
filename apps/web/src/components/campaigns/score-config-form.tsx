'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { scoreConfigSchema, ScoreConfigInput } from '@kol360/shared';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const segments = [
  { key: 'weightPublications', label: 'Peer-reviewed Publications', defaultWeight: 10 },
  { key: 'weightClinicalTrials', label: 'Clinical Trials', defaultWeight: 15 },
  { key: 'weightTradePubs', label: 'Trade Publications', defaultWeight: 10 },
  { key: 'weightOrgLeadership', label: 'Organization Leadership', defaultWeight: 10 },
  { key: 'weightOrgAwareness', label: 'Organization Awareness', defaultWeight: 10 },
  { key: 'weightConference', label: 'Conference Presentations', defaultWeight: 10 },
  { key: 'weightSocialMedia', label: 'Social Media', defaultWeight: 5 },
  { key: 'weightMediaPodcasts', label: 'Media/Podcasts', defaultWeight: 5 },
  { key: 'weightSurvey', label: 'Survey Score', defaultWeight: 25 },
] as const;

interface ScoreConfigFormProps {
  config: ScoreConfigInput | null;
  onSave: (data: ScoreConfigInput) => Promise<void>;
  onReset: () => Promise<void>;
  isLoading?: boolean;
}

export function ScoreConfigForm({ config, onSave, onReset, isLoading }: ScoreConfigFormProps) {
  const form = useForm<ScoreConfigInput>({
    resolver: zodResolver(scoreConfigSchema),
    defaultValues: config || {
      weightPublications: 10,
      weightClinicalTrials: 15,
      weightTradePubs: 10,
      weightOrgLeadership: 10,
      weightOrgAwareness: 10,
      weightConference: 10,
      weightSocialMedia: 5,
      weightMediaPodcasts: 5,
      weightSurvey: 25,
    },
  });

  useEffect(() => {
    if (config) {
      form.reset(config);
    }
  }, [config, form]);

  const values = form.watch();
  const total = segments.reduce((sum, s) => sum + (values[s.key] || 0), 0);
  const isValidTotal = Math.abs(total - 100) < 0.01;

  const handleSubmit = async (data: ScoreConfigInput) => {
    await onSave(data);
  };

  const handleReset = async () => {
    await onReset();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Composite Score Weights</CardTitle>
        <CardDescription>
          Configure the weight of each scoring segment. Weights must sum to 100%.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {segments.map((segment) => (
              <div key={segment.key} className="flex items-center gap-3">
                <Label className="flex-1 text-sm">{segment.label}</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    className="w-20 text-right"
                    {...form.register(segment.key, { valueAsNumber: true })}
                  />
                  <span className="text-sm text-muted-foreground w-4">%</span>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-4">
            <div className={`text-right text-lg font-bold ${isValidTotal ? 'text-green-600' : 'text-red-600'}`}>
              Total: {total.toFixed(2)}%
              {!isValidTotal && (
                <span className="text-sm font-normal ml-2">
                  (Must equal 100%)
                </span>
              )}
            </div>
          </div>

          {form.formState.errors.root && (
            <p className="text-sm text-red-600">{form.formState.errors.root.message}</p>
          )}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              disabled={isLoading}
            >
              Reset to Defaults
            </Button>
            <Button
              type="submit"
              disabled={!isValidTotal || isLoading || form.formState.isSubmitting}
            >
              {form.formState.isSubmitting ? 'Saving...' : 'Save Weights'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
