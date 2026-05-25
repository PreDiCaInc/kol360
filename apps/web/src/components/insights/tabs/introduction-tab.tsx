'use client';

import { Card, CardContent } from '@/components/ui/card';

interface IntroductionTabProps {
  diseaseAreaId: string;
}

// diseaseAreaId is currently unused but kept for parity with the other tab
// components — the Introduction tab may surface DA-specific text/branding
// later, and keeping the prop shape stable means InsightsDashboard can pass
// it without conditionals.
export function IntroductionTab(_props: IntroductionTabProps) {
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
    </div>
  );
}
