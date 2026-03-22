'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, MessageSquare } from 'lucide-react';
import { useInsightsSummary } from '@/hooks/use-insights-report';

interface IntroductionTabProps {
  diseaseAreaId: string;
}

export function IntroductionTab({ diseaseAreaId }: IntroductionTabProps) {
  const { data: summary, isLoading } = useInsightsSummary(diseaseAreaId);

  return (
    <div className="space-y-8">
      {/* Hero Header */}
      <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-700 px-8 py-8 text-white shadow-lg">
        <h2 className="text-3xl font-extrabold tracking-tight">INTRODUCTION</h2>
        <p className="mt-2 text-blue-100 text-lg">KOL360 Sociometric Research Report</p>
      </div>

      {/* Purpose */}
      <Card className="border-l-4 border-l-blue-500 shadow-md rounded-xl">
        <CardContent className="pt-6 space-y-3">
          <h3 className="text-lg font-bold text-blue-700 dark:text-blue-400">Purpose</h3>
          <p className="text-muted-foreground leading-relaxed">
            This report presents the findings of a sociometric research study designed to identify
            and rank Key Opinion Leaders (KOLs) within the specified disease area. The study
            leverages peer-nominated influence mapping to provide an evidence-based assessment of
            thought leadership, clinical expertise, and professional influence among healthcare
            professionals.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            The results enable strategic decision-making for medical affairs engagement,
            advisory board selection, speaker bureau development, and targeted outreach
            initiatives.
          </p>
        </CardContent>
      </Card>

      {/* Methodology */}
      <Card className="border-l-4 border-l-indigo-500 shadow-md rounded-xl">
        <CardContent className="pt-6 space-y-3">
          <h3 className="text-lg font-bold text-indigo-700 dark:text-indigo-400">Methodology</h3>
          <p className="text-muted-foreground leading-relaxed">
            The KOL360 sociometric survey was administered to a carefully selected panel of
            healthcare professionals practicing within the disease area. Respondents were asked to
            nominate peers they consider influential across multiple dimensions, including thought
            leadership, clinical expertise, research contribution, and regional influence.
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Each nominated individual was scored based on the frequency and breadth of nominations
            received, producing composite influence scores that reflect both depth and diversity of
            peer recognition. The resulting rankings provide a data-driven view of the KOL landscape.
          </p>
        </CardContent>
      </Card>

      {/* Demographics At A Glance */}
      <section className="space-y-4">
        <h3 className="text-xl font-bold">Demographics At A Glance</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200 dark:border-blue-800 shadow-md rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-blue-600 dark:text-blue-400 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total KOLs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold text-blue-700 dark:text-blue-300">
                {isLoading ? '...' : (summary?.totalKols ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                Unique KOLs identified through peer nominations
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-950 dark:to-emerald-900 border-emerald-200 dark:border-emerald-800 shadow-md rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                <UserCheck className="h-4 w-4" />
                Total Respondents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold text-emerald-700 dark:text-emerald-300">
                {isLoading ? '...' : (summary?.totalRespondents ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-emerald-500 dark:text-emerald-400 mt-1">
                Healthcare professionals who completed the survey
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-950 dark:to-amber-900 border-amber-200 dark:border-amber-800 shadow-md rounded-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400 flex items-center gap-2">
                <MessageSquare className="h-4 w-4" />
                Total Nominations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-extrabold text-amber-700 dark:text-amber-300">
                {isLoading ? '...' : (summary?.totalNominations ?? 0).toLocaleString()}
              </div>
              <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">
                Peer nominations received across all categories
              </p>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
