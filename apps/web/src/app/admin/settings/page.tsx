'use client';

import { useState } from 'react';
import { useSettings, useUpdateSettings } from '@/hooks/use-settings';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Shield,
  Server,
  Eye,
  EyeOff,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';

export default function SettingsPage() {
  const { data: settings, isLoading, isError, error, refetch } = useSettings();
  const updateSettings = useUpdateSettings();

  // Local state for form values
  const [healthCheckToken, setHealthCheckToken] = useState('');
  const [showHealthCheckToken, setShowHealthCheckToken] = useState(false);
  const [sesFromEmail, setSesFromEmail] = useState('');
  const [sesFromName, setSesFromName] = useState('');
  const [sendExternalEmail, setSendExternalEmail] = useState(false);
  const [emailMockMode, setEmailMockMode] = useState(false);

  // Track which fields have been modified
  const [modifiedFields, setModifiedFields] = useState<Set<string>>(new Set());

  // Update local state when settings are loaded
  const initializeFromSettings = () => {
    if (settings) {
      setSesFromEmail(settings.email.sesFromEmail);
      setSesFromName(settings.email.sesFromName);
      setSendExternalEmail(settings.email.sendExternalEmail);
      setEmailMockMode(settings.email.emailMockMode);
      setModifiedFields(new Set());
      setHealthCheckToken('');
    }
  };

  // Initialize on first load
  if (settings && modifiedFields.size === 0 && !sesFromEmail && !sesFromName) {
    initializeFromSettings();
  }

  const markModified = (field: string) => {
    setModifiedFields(prev => new Set(prev).add(field));
  };

  const handleSave = async () => {
    const updates: Record<string, unknown> = {};

    if (modifiedFields.has('healthCheckToken') && healthCheckToken) {
      updates.healthCheckToken = healthCheckToken;
    }
    if (modifiedFields.has('sendExternalEmail')) {
      updates.sendExternalEmail = sendExternalEmail;
    }
    if (modifiedFields.has('emailMockMode')) {
      updates.emailMockMode = emailMockMode;
    }
    if (modifiedFields.has('sesFromEmail')) {
      updates.sesFromEmail = sesFromEmail;
    }
    if (modifiedFields.has('sesFromName')) {
      updates.sesFromName = sesFromName;
    }

    if (Object.keys(updates).length === 0) {
      return;
    }

    try {
      await updateSettings.mutateAsync(updates);
      setModifiedFields(new Set());
      setHealthCheckToken('');
    } catch {
      // Error is handled by the mutation
    }
  };

  const hasChanges = modifiedFields.size > 0;

  if (isLoading) {
    return (
      <div className="p-6 lg:p-8 fade-in">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage application configuration</p>
          </div>
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 rounded-xl skeleton" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 lg:p-8 fade-in">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage application configuration</p>
          </div>
          <Card className="border-destructive">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <AlertTriangle className="w-12 h-12 text-destructive mb-4" />
              <h3 className="text-lg font-medium mb-2">Failed to load settings</h3>
              <p className="text-muted-foreground mb-4 text-center max-w-md">
                {error instanceof Error ? error.message : 'Unable to connect to the server. Please check your connection and try again.'}
              </p>
              <Button onClick={() => refetch()} variant="outline">
                <RefreshCw className="w-4 h-4 mr-2" />
                Retry
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 fade-in">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1">Manage application configuration</p>
          </div>
          <Button onClick={handleSave} disabled={!hasChanges || updateSettings.isPending}>
            {updateSettings.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>

        {/* Success Message */}
        {updateSettings.isSuccess && (
          <div className="p-4 text-sm text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400 rounded-lg border border-emerald-200 dark:border-emerald-800/30 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Settings updated successfully. Note: Changes are applied to the running process.
          </div>
        )}

        {/* Error Message */}
        {updateSettings.isError && (
          <div className="p-4 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-lg border border-red-200 dark:border-red-800/30 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {updateSettings.error instanceof Error ? updateSettings.error.message : 'Failed to update settings'}
          </div>
        )}

        {/* Email Configuration Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <CardTitle>Email Configuration</CardTitle>
                <CardDescription>Configure email sending settings</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Send External Email Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="send-external-email" className="text-base">Allow External Emails</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, emails can be sent to non bio-exec.com domains
                </p>
              </div>
              <Switch
                id="send-external-email"
                checked={sendExternalEmail}
                onCheckedChange={(checked) => {
                  setSendExternalEmail(checked);
                  markModified('sendExternalEmail');
                }}
              />
            </div>

            {/* Email Mock Mode Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="email-mock-mode" className="text-base">Email Mock Mode</Label>
                <p className="text-sm text-muted-foreground">
                  When enabled, emails are logged but not actually sent
                </p>
              </div>
              <Switch
                id="email-mock-mode"
                checked={emailMockMode}
                onCheckedChange={(checked) => {
                  setEmailMockMode(checked);
                  markModified('emailMockMode');
                }}
              />
            </div>

            {/* SES From Email */}
            <div className="space-y-2">
              <Label htmlFor="ses-from-email">SES From Email</Label>
              <Input
                id="ses-from-email"
                type="email"
                value={sesFromEmail}
                onChange={(e) => {
                  setSesFromEmail(e.target.value);
                  markModified('sesFromEmail');
                }}
                placeholder="noreply@example.com"
              />
              <p className="text-sm text-muted-foreground">
                The email address used as the sender for outgoing emails
              </p>
            </div>

            {/* SES From Name */}
            <div className="space-y-2">
              <Label htmlFor="ses-from-name">SES From Name</Label>
              <Input
                id="ses-from-name"
                type="text"
                value={sesFromName}
                onChange={(e) => {
                  setSesFromName(e.target.value);
                  markModified('sesFromName');
                }}
                placeholder="BioExec KOL360"
              />
              <p className="text-sm text-muted-foreground">
                The display name shown in email clients
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Security Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <Shield className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <CardTitle>Security</CardTitle>
                <CardDescription>Security-related configuration</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Health Check Token */}
            <div className="space-y-2">
              <Label htmlFor="health-check-token">Health Check Token</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="health-check-token"
                    type={showHealthCheckToken ? 'text' : 'password'}
                    value={healthCheckToken}
                    onChange={(e) => {
                      setHealthCheckToken(e.target.value);
                      markModified('healthCheckToken');
                    }}
                    placeholder={settings?.security.healthCheckToken || 'Enter new token'}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowHealthCheckToken(!showHealthCheckToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showHealthCheckToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Token required for authenticated health check endpoints. Current value: {settings?.security.healthCheckToken || 'Not set'}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* System Info Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/10">
                <Server className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <CardTitle>System Information</CardTitle>
                <CardDescription>Read-only system configuration values</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* App URL */}
            <div className="space-y-2">
              <Label>Application URL</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={settings?.system.appUrl || 'Not configured'}
                  readOnly
                  disabled
                  className="bg-muted"
                />
                <Badge variant="muted">Read-only</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                The public URL of the application (NEXT_PUBLIC_APP_URL)
              </p>
            </div>

            {/* Environment */}
            <div className="space-y-2">
              <Label>Environment</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={settings?.system.environment || 'unknown'}
                  readOnly
                  disabled
                  className="bg-muted"
                />
                <Badge
                  variant={settings?.system.environment === 'production' ? 'success' : 'warning'}
                >
                  {settings?.system.environment || 'unknown'}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Current runtime environment (NODE_ENV)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Footer Note */}
        <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-4">
          <p className="font-medium mb-1">Important Note</p>
          <p>
            Changes made here are applied to the running process only. For permanent changes,
            update the environment variables in your deployment configuration (e.g., .env files,
            cloud provider settings, or container environment).
          </p>
        </div>
      </div>
    </div>
  );
}
