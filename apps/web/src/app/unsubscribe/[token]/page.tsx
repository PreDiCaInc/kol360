'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useUnsubscribeInfo, useUnsubscribe } from '@/hooks/use-survey-taking';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Loader2, MailX } from 'lucide-react';

export default function UnsubscribePage() {
  const params = useParams();
  const token = params.token as string;

  const { data: info, isLoading, error } = useUnsubscribeInfo(token);
  const unsubscribe = useUnsubscribe();

  const [scope, setScope] = useState<'CAMPAIGN' | 'GLOBAL'>('CAMPAIGN');
  const [reason, setReason] = useState('');
  const [success, setSuccess] = useState(false);

  const handleUnsubscribe = async () => {
    try {
      await unsubscribe.mutateAsync({ token, scope, reason: reason || undefined });
      setSuccess(true);
    } catch (err) {
      console.error('Failed to unsubscribe:', err);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (error || !info) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Invalid Link</h2>
              <p className="text-muted-foreground">
                This unsubscribe link is invalid or has expired.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">Unsubscribed</h2>
              <p className="text-muted-foreground">
                {scope === 'GLOBAL'
                  ? 'You have been unsubscribed from all future survey invitations.'
                  : `You have been unsubscribed from "${info.campaignName}" survey emails.`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <MailX className="w-12 h-12 text-muted-foreground" />
            </div>
            <CardTitle>Unsubscribe</CardTitle>
            <CardDescription>
              Manage your email preferences for KOL360 surveys
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <Label>What would you like to do?</Label>
              <RadioGroup
                value={scope}
                onValueChange={(value) => setScope(value as 'CAMPAIGN' | 'GLOBAL')}
              >
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="CAMPAIGN" id="campaign" className="mt-1" />
                  <div>
                    <Label htmlFor="campaign" className="font-normal cursor-pointer">
                      Unsubscribe from this campaign only
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Stop receiving emails about "{info.campaignName}"
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-2">
                  <RadioGroupItem value="GLOBAL" id="global" className="mt-1" />
                  <div>
                    <Label htmlFor="global" className="font-normal cursor-pointer">
                      Unsubscribe from all surveys
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Stop receiving all future survey invitations
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Tell us why you're unsubscribing..."
                rows={3}
              />
            </div>

            <Button
              onClick={handleUnsubscribe}
              disabled={unsubscribe.isPending}
              className="w-full"
              variant="destructive"
            >
              {unsubscribe.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Unsubscribe
            </Button>

            {unsubscribe.isError && (
              <p className="text-red-500 text-sm text-center">
                Failed to unsubscribe. Please try again.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
