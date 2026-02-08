'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useKolProfile, useKolExplorer } from '@/hooks/use-insights-report';
import { KolCombobox } from '../kol-combobox';
import type { NominationType } from '@kol360/shared';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from 'recharts';

interface Props {
  diseaseAreaId: string;
}

const SCORE_COLORS = [
  '#0088FE', // Publications
  '#00C49F', // Trade Pubs
  '#FFBB28', // Org Leadership
  '#FF8042', // Org Awards
  '#8884D8', // Clinical Trials
  '#82CA9D', // Conference
  '#FFC658', // Social Media
  '#8DD1E1', // Media/Podcasts
  '#FF6B6B', // Survey
];

const NOMINATION_COLORS: Record<string, string> = {
  discussionLeaders: '#3B82F6',
  referralLeaders: '#10B981',
  adviceLeaders: '#8B5CF6',
  nationalLeader: '#F59E0B',
  risingStar: '#EC4899',
  socialLeader: '#06B6D4',
  DISCUSSION_LEADERS: '#3B82F6',
  REFERRAL_LEADERS: '#10B981',
  ADVICE_LEADERS: '#8B5CF6',
  NATIONAL_LEADER: '#F59E0B',
  RISING_STAR: '#EC4899',
  SOCIAL_LEADER: '#06B6D4',
};

const NOMINATION_TYPE_LABELS: Record<NominationType, string> = {
  DISCUSSION_LEADERS: 'Discussion',
  REFERRAL_LEADERS: 'Referral',
  ADVICE_LEADERS: 'Advice',
  NATIONAL_LEADER: 'National',
  RISING_STAR: 'Rising Star',
  SOCIAL_LEADER: 'Social',
};

const PIE_COLORS = [
  '#0088FE',
  '#00C49F',
  '#FFBB28',
  '#FF8042',
  '#8884D8',
  '#82CA9D',
  '#FFC658',
  '#8DD1E1',
  '#FF6B6B',
  '#A4DE6C',
];

export function KolProfileTab({ diseaseAreaId }: Props) {
  const [selectedKolId, setSelectedKolId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAllNominators, setShowAllNominators] = useState(false);

  // Get list of KOLs for selector
  const { data: kolList, isLoading: isLoadingKols } = useKolExplorer(diseaseAreaId, {
    search: searchQuery,
    limit: 20,
  });

  // Get selected KOL's profile
  const { data: profile, isLoading } = useKolProfile(diseaseAreaId, selectedKolId);

  const handleSearchChange = useCallback((search: string) => {
    setSearchQuery(search);
  }, []);

  const handleKolChange = useCallback((kolId: string | null) => {
    setSelectedKolId(kolId);
    setShowAllNominators(false); // Reset when switching KOLs
  }, []);

  // Prepare score data for chart
  const scoreData = profile
    ? [
        { name: 'Publications', value: profile.scores.scorePublications || 0 },
        { name: 'Trade Pubs', value: profile.scores.scoreTradePubs || 0 },
        { name: 'Org Leadership', value: profile.scores.scoreOrgLeadership || 0 },
        { name: 'Org Awards', value: profile.scores.scoreOrgAwards || 0 },
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

  // Prepare KOL options for combobox
  const kolOptions = kolList?.items.map((kol) => ({
    id: kol.id,
    name: kol.name,
    specialty: kol.specialty,
    state: kol.state,
  })) || [];

  return (
    <div className="space-y-6">
      {/* KOL Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select KOL</CardTitle>
          <CardDescription>Search and select a KOL to view their detailed profile</CardDescription>
        </CardHeader>
        <CardContent>
          <KolCombobox
            options={kolOptions}
            value={selectedKolId}
            onValueChange={handleKolChange}
            onSearchChange={handleSearchChange}
            isLoading={isLoadingKols}
            className="max-w-lg"
          />
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
                <CardTitle className="text-sm text-muted-foreground">Total Nominations</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{profile.nominations.total}</p>
              </CardContent>
            </Card>
          </div>

          {/* Score and Nomination Charts */}
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

          {/* Nominator Demographics Charts */}
          {profile.nominatorDemographics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Nominators by Specialty */}
              <Card>
                <CardHeader>
                  <CardTitle>Nominators by Specialty</CardTitle>
                  <CardDescription>
                    Specialty breakdown of HCPs who nominated this KOL
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    {profile.nominatorDemographics.bySpecialty.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={profile.nominatorDemographics.bySpecialty.slice(0, 6)}
                            dataKey="count"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            label={({ name, percent }) =>
                              `${name} (${((percent || 0) * 100).toFixed(0)}%)`
                            }
                          >
                            {profile.nominatorDemographics.bySpecialty
                              .slice(0, 6)
                              .map((_, index) => (
                                <Cell
                                  key={`cell-${index}`}
                                  fill={PIE_COLORS[index % PIE_COLORS.length]}
                                />
                              ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        No nominator data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Nominators by State */}
              <Card>
                <CardHeader>
                  <CardTitle>Nominators by State</CardTitle>
                  <CardDescription>
                    Geographic distribution of nominators
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    {profile.nominatorDemographics.byState.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={profile.nominatorDemographics.byState.slice(0, 10)}
                          layout="vertical"
                          margin={{ left: 40 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" />
                          <YAxis type="category" dataKey="name" width={35} />
                          <Tooltip />
                          <Bar dataKey="count" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">
                        No nominator data available
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Nominators Table */}
          {profile.nominators && profile.nominators.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Who Nominated This KOL</CardTitle>
                    <CardDescription>
                      {showAllNominators
                        ? `All ${profile.nominators.length} nominators`
                        : `Showing ${Math.min(25, profile.nominators.length)} of ${profile.nominators.length} nominators`}
                    </CardDescription>
                  </div>
                  {profile.nominators.length > 25 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAllNominators(!showAllNominators)}
                    >
                      {showAllNominators ? 'Show Less' : 'Show All'}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead>Nominator</TableHead>
                        <TableHead>Specialty</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>Nomination Type</TableHead>
                        <TableHead>Campaign</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(showAllNominators ? profile.nominators : profile.nominators.slice(0, 25)).map((nominator, index) => (
                        <TableRow key={`${nominator.id}-${index}`}>
                          <TableCell className="font-medium">{nominator.name}</TableCell>
                          <TableCell>{nominator.specialty || '-'}</TableCell>
                          <TableCell>{nominator.state || '-'}</TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              style={{
                                borderColor:
                                  NOMINATION_COLORS[nominator.nominationType] || '#888',
                                color: NOMINATION_COLORS[nominator.nominationType] || '#888',
                              }}
                            >
                              {NOMINATION_TYPE_LABELS[nominator.nominationType] ||
                                nominator.nominationType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {nominator.campaignName}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
