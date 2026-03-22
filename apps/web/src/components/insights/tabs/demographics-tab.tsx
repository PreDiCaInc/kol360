'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieDistributionChart } from '@/components/insights/charts/pie-distribution-chart';
import { BarDistributionChart } from '@/components/insights/charts/bar-distribution-chart';
import { StateBarChart } from '@/components/insights/charts/state-bar-chart';
import { StackedBarChart } from '@/components/insights/charts/stacked-bar-chart';
import { useDemographics } from '@/hooks/use-insights-report';

interface Props {
  diseaseAreaId: string;
  clientId?: string;
}

export function DemographicsTab({ diseaseAreaId, clientId }: Props) {
  const { data, isLoading, error } = useDemographics(diseaseAreaId, clientId);

  // Transform data for chart components
  const roleData = useMemo(() => {
    if (!data?.byRole) return [];
    return data.byRole.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byRole]);

  const decileData = useMemo(() => {
    if (!data?.byDecile) return [];
    return data.byDecile.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byDecile]);

  const monthlyPatientsData = useMemo(() => {
    if (!data?.byMonthlyPatients) return [];
    return data.byMonthlyPatients.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byMonthlyPatients]);

  const dedPatientsData = useMemo(() => {
    if (!data?.byDedPatients) return [];
    return data.byDedPatients.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byDedPatients]);

  const yearsData = useMemo(() => {
    if (!data?.byYearsInPractice) return [];
    return data.byYearsInPractice.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.byYearsInPractice]);

  const stateData = useMemo(() => {
    if (!data?.byState) return [];
    return data.byState.map((d) => ({ name: d.name, count: d.count }));
  }, [data?.byState]);

  const practiceSettingData = useMemo(() => {
    if (!data?.byPracticeSetting) return [];
    return data.byPracticeSetting.map((d) => ({ name: d.name, count: d.count }));
  }, [data?.byPracticeSetting]);

  const coreFocusPatientData = useMemo(() => {
    if (!data?.coreFocusByPatients) return [];
    return data.coreFocusByPatients
      .filter((d) => d.coreFocus && d.coreFocus.trim() !== '' && d.count > 0)
      .map((d) => ({
        name: d.coreFocus,
        value: Math.round(d.totalPatients / d.count),
      }));
  }, [data?.coreFocusByPatients]);

  const topicsDiscussedPieData = useMemo(() => {
    if (!data?.topicsDiscussed) return [];
    return data.topicsDiscussed.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.topicsDiscussed]);

  const topicsDiscussedBarData = useMemo(() => {
    if (!data?.topicsDiscussed) return [];
    return data.topicsDiscussed.map((d) => ({ name: d.name, value: d.count }));
  }, [data?.topicsDiscussed]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Loading demographics data...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12 text-destructive">
        Error loading demographics data
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        No demographics data available
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold">Respondent Demographics</h2>
        <p className="text-sm text-muted-foreground">
          Survey respondent demographics across {data.totalRespondents} respondents
        </p>
      </div>

      {/* Section: Role & Decile */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">Role & Market Profile</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-blue-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Respondent Role</CardTitle>
              <CardDescription>Primary medical specialty distribution</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <PieDistributionChart data={roleData} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-violet-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Treatment Decile</CardTitle>
              <CardDescription>Market decile distribution of respondents</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={decileData} color="#8B5CF6" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section: Patient Volume */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">Patient Volume</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-blue-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Total Monthly Patients</CardTitle>
              <CardDescription>Distribution of monthly patient volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={monthlyPatientsData} color="#3B82F6" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-emerald-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Monthly DED Patients</CardTitle>
              <CardDescription>Distribution of dry eye disease patient volume</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={dedPatientsData} color="#10B981" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Section: Practice Profile */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">Practice Profile</h3>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-amber-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Years in Practice</CardTitle>
              <CardDescription>Distribution of practice experience</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={yearsData} color="#F59E0B" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Location by State</CardTitle>
              <CardDescription>Top states of respondent HCPs</CardDescription>
            </CardHeader>
            <CardContent>
              <div style={{ minHeight: 300 }}>
                <StateBarChart data={stateData} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Practice Setting (full width) */}
      <Card className="border-t-4 border-t-purple-500 shadow-md rounded-xl">
        <CardHeader>
          <CardTitle className="text-base font-bold">Practice Setting</CardTitle>
          <CardDescription>Practice type distribution of respondents</CardDescription>
        </CardHeader>
        <CardContent>
          <div style={{ minHeight: 300 }}>
            <StateBarChart data={practiceSettingData} />
          </div>
        </CardContent>
      </Card>

      {/* Core Focus x Monthly Patients (full width) */}
      {coreFocusPatientData.length > 0 && (
        <Card className="border-t-4 border-t-cyan-500 shadow-md rounded-xl">
          <CardHeader>
            <CardTitle className="text-base font-bold">Core Focus by Average Monthly Patients</CardTitle>
            <CardDescription>Average monthly patients by respondent core focus area</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <BarDistributionChart data={coreFocusPatientData} color="#06B6D4" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section: Educational Preferences */}
      {data.educationalResources.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-base font-semibold text-muted-foreground uppercase tracking-wide border-b pb-2">Educational Preferences</h3>
          <Card className="border-t-4 border-t-green-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Educational Resources (All)</CardTitle>
              <CardDescription>Ranking of preferred educational resources</CardDescription>
            </CardHeader>
            <CardContent>
              <StackedBarChart data={data.educationalResources} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Educational Resources Academic + Other */}
      {(data.educationalResourcesAcademic.length > 0 || data.educationalResourcesOther.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {data.educationalResourcesAcademic.length > 0 && (
            <Card className="border-t-4 border-t-lime-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Educational Resources (Academic)</CardTitle>
                <CardDescription>Academic respondent preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <StackedBarChart data={data.educationalResourcesAcademic} />
              </CardContent>
            </Card>
          )}

          {data.educationalResourcesOther.length > 0 && (
            <Card className="border-t-4 border-t-orange-500 shadow-md rounded-xl">
              <CardHeader>
                <CardTitle className="text-base font-bold">Educational Resources (Other)</CardTitle>
                <CardDescription>Non-academic respondent preferences</CardDescription>
              </CardHeader>
              <CardContent>
                <StackedBarChart data={data.educationalResourcesOther} />
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Topics Discussed (only if data exists) */}
      {data.topicsDiscussed && data.topicsDiscussed.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-t-4 border-t-rose-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Topics Discussed (Distribution)</CardTitle>
              <CardDescription>Topics discussed with HCPs</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <PieDistributionChart data={topicsDiscussedPieData} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-pink-500 shadow-md rounded-xl">
            <CardHeader>
              <CardTitle className="text-base font-bold">Topics Discussed (Counts)</CardTitle>
              <CardDescription>Number of respondents per topic</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <BarDistributionChart data={topicsDiscussedBarData} color="#EC4899" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
