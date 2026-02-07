'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useKolProfile, useKolExplorer } from '@/hooks/use-insights-report';
import { SCORE_FIELDS } from '@kol360/shared';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface Props {
  diseaseAreaId: string;
}

const SCORE_COLORS = [
  '#0088FE', // Publications
  '#00C49F', // Trade Pubs
  '#FFBB28', // Org Leadership
  '#FF8042', // Org Awareness
  '#8884D8', // Clinical Trials
  '#82CA9D', // Conference
  '#FFC658', // Social Media
  '#8DD1E1', // Media/Podcasts
  '#FF6B6B', // Survey
];

const NOMINATION_COLORS = {
  discussionLeaders: '#3B82F6',
  referralLeaders: '#10B981',
  adviceLeaders: '#8B5CF6',
  nationalLeader: '#F59E0B',
  risingStar: '#EC4899',
  socialLeader: '#06B6D4',
};

export function KolProfileTab({ diseaseAreaId }: Props) {
  const [selectedKolId, setSelectedKolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Get list of KOLs for selector
  const { data: kolList } = useKolExplorer(diseaseAreaId, {
    search: searchQuery,
    limit: 20,
  });

  // Get selected KOL's profile
  const { data: profile, isLoading } = useKolProfile(diseaseAreaId, selectedKolId);

  // Prepare score data for chart
  const scoreData = profile
    ? [
        { name: 'Publications', value: profile.scores.scorePublications || 0 },
        { name: 'Trade Pubs', value: profile.scores.scoreTradePubs || 0 },
        { name: 'Org Leadership', value: profile.scores.scoreOrgLeadership || 0 },
        { name: 'Org Awareness', value: profile.scores.scoreOrgAwareness || 0 },
        { name: 'Clinical Trials', value: profile.scores.scoreClinicalTrials || 0 },
        { name: 'Conference', value: profile.scores.scoreConference || 0 },
        { name: 'Social Media', value: profile.scores.scoreSocialMedia || 0 },
        { name: 'Media/Podcasts', value: profile.scores.scoreMediaPodcasts || 0 },
        { name: 'Survey Score', value: profile.scores.scoreSurvey || 0 },
      ]
    : [];

  // Prepare nomination data for chart
  const nominationData = profile
    ? [
        { name: 'Discussion', value: profile.nominations.discussionLeaders, color: NOMINATION_COLORS.discussionLeaders },
        { name: 'Referral', value: profile.nominations.referralLeaders, color: NOMINATION_COLORS.referralLeaders },
        { name: 'Advice', value: profile.nominations.adviceLeaders, color: NOMINATION_COLORS.adviceLeaders },
        { name: 'National', value: profile.nominations.nationalLeader, color: NOMINATION_COLORS.nationalLeader },
        { name: 'Rising Star', value: profile.nominations.risingStar, color: NOMINATION_COLORS.risingStar },
        { name: 'Social', value: profile.nominations.socialLeader, color: NOMINATION_COLORS.socialLeader },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* KOL Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select KOL</CardTitle>
          <CardDescription>Choose a KOL to view their detailed profile</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Input
              placeholder="Search by name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <Select value={selectedKolId || ''} onValueChange={setSelectedKolId}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select a KOL" />
              </SelectTrigger>
              <SelectContent>
                {kolList?.items.map((kol) => (
                  <SelectItem key={kol.id} value={kol.id}>
                    {kol.name} - {kol.specialty || 'Unknown'} ({kol.state || 'Unknown'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!selectedKolId ? (
        <Card>
          <CardContent className="h-64 flex items-center justify-center text-muted-foreground">
            Select a KOL to view their profile
          </CardContent>
        </Card>
      ) : isLoading ? (
        <Card>
          <CardContent className="h-64 flex items-center justify-center text-muted-foreground">
            Loading profile...
          </CardContent>
        </Card>
      ) : !profile ? (
        <Card>
          <CardContent className="h-64 flex items-center justify-center text-muted-foreground">
            Profile not found
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Influencer Type</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant="default">{profile.influencerType || 'Unknown'}</Badge>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Specialty</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{profile.specialty || 'Unknown'}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Total Weighted Score</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">
                  {profile.scores.compositeScore?.toFixed(1) ?? 'N/A'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">State</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-medium">{profile.state || 'Unknown'}</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Score Breakdown Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Score Breakdown (9 Dimensions)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={scoreData} layout="vertical" margin={{ left: 100 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" domain={[0, 100]} />
                      <YAxis type="category" dataKey="name" width={90} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                        {scoreData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={SCORE_COLORS[index]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Nomination Breakdown Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Nomination Counts by Type</CardTitle>
                <CardDescription>Total nominations: {profile.nominations.total}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={nominationData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {nominationData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
