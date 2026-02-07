'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Construction } from 'lucide-react';

interface Props {
  diseaseAreaId: string;
}

export function RespondentAnalyticsTab({ diseaseAreaId }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Respondent Analytics</CardTitle>
        <CardDescription>
          Demographics, histograms, and geographic analysis of survey respondents
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-96 flex flex-col items-center justify-center text-muted-foreground gap-4">
          <Construction className="h-16 w-16" />
          <div className="text-center">
            <p className="text-lg font-medium">Coming Soon</p>
            <p className="text-sm">
              This tab will include 13+ visualizations including:
            </p>
            <ul className="text-sm mt-2 space-y-1">
              <li>Histogram of Respondent Deciles</li>
              <li>Pie Charts (Role, Board Certification)</li>
              <li>Geographic Heatmap by State</li>
              <li>Practice Setting Distribution</li>
              <li>Monthly Patients Analysis</li>
              <li>Educational Resources Rankings</li>
              <li>Topics Discussed Analysis</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
