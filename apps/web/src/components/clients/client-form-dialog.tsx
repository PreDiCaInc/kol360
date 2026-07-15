'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createClientSchema, CreateClientInput } from '@kol360/shared';
import { useClient, useCreateClient, useUpdateClient } from '@/hooks/use-clients';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// v1.17.47 — parse comma/whitespace-separated domain input into a
// normalized array. Empty input → []. Trims, lowercases, drops
// empties + dupes. Backend re-validates via Zod (regex check) so we
// just clean the shape here.
function parseDomainsInput(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(/[\s,]+/)) {
    const d = piece.trim().toLowerCase();
    if (!d || seen.has(d)) continue;
    seen.add(d);
    out.push(d);
  }
  return out;
}

// v1.17.47 — domains input with local raw-text state.
//
// Pre-fix the Input was controlled directly off the parsed array:
//   display = field.value.join(', ')
//   onChange → parseDomainsInput → field.onChange(array)
// Typing ',' or ' ' eats the separator: parse strips trailing
// separators when re-joining, so the user's keystroke vanished
// before they could finish the next domain. Could not actually
// type a list at all.
//
// Fix: track the raw display string locally. Sync down from the
// form value when it changes EXTERNALLY (parent re-renders with a
// different array). Sync up to the form on blur — at which point
// react-hook-form has the parsed array ready for validation /
// submit. Submitting via the form Submit button blurs the input
// first, so the form state catches up before onSubmit reads it.
function DomainsInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [raw, setRaw] = useState<string>(() => value.join(', '));
  // Re-sync raw text when the external value changes (form reset,
  // edit-mode load, etc.) — but only if the parsed array differs
  // from what we currently display. This guard prevents a
  // ping-pong: user types ',' → raw updates → blur → onChange →
  // parent re-renders → effect would otherwise overwrite raw.
  useEffect(() => {
    const externalAsString = value.join(', ');
    if (externalAsString !== parseDomainsInput(raw).join(', ')) {
      setRaw(externalAsString);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <Input
      value={raw}
      onChange={(e) => setRaw(e.target.value)}
      onBlur={() => onChange(parseDomainsInput(raw))}
      placeholder="sunpharma.com, na.sunpharma.com"
    />
  );
}

// v1.17.60 — logo upload + preview + 20KB cap.
//
// `value` is whatever ends up in client.logoUrl: an http(s) URL OR a
// data:image/* base64 URI (newly accepted by the Zod schema). Upload
// tab reads the picked file via FileReader.readAsDataURL → that string
// becomes the field value. Server stores it directly in the column;
// emails embed the data URI inline. Storage choice: inline (no S3
// infra needed) — viable because the 20 KB cap keeps the data URI
// small enough that the row + every outgoing email body stay tiny.
//
// The 20 KB binary cap is enforced client-side here AND at the Zod
// schema layer (~32 KB char cap = ~24 KB binary; tighter than that
// the schema would reject the rare paste-URL case for a URL > 32 KB,
// which doesn't exist).
const LOGO_MAX_BINARY_BYTES = 20 * 1024;

function LogoField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  // Decide the default tab from the current value shape so editing
  // an existing http(s) URL opens on Paste URL, not the empty Upload
  // form.
  const initialTab = value && /^data:image\//.test(value) ? 'upload' : 'url';

  return (
    <FormItem>
      <FormLabel>Client Logo</FormLabel>

      {value ? (
        <div className="flex items-center gap-3 rounded-md border p-2 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Logo preview"
            className="h-12 w-auto max-w-[180px] object-contain"
            onError={() => setImgFailed(true)}
            onLoad={() => setImgFailed(false)}
          />
          <div className="flex-1 min-w-0">
            {imgFailed ? (
              <span className="text-sm text-destructive">
                Image failed to load. Check the URL or upload a new file.
              </span>
            ) : (
              <span className="text-xs text-muted-foreground break-all">
                {value.startsWith('data:') ? 'Uploaded image (inline)' : value}
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(null);
              setImgFailed(false);
              setError(null);
            }}
          >
            Remove
          </Button>
        </div>
      ) : null}

      <Tabs defaultValue={initialTab} className="mt-2">
        <TabsList>
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="url">Paste URL</TabsTrigger>
        </TabsList>

        <TabsContent value="upload" className="space-y-2">
          <Input
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            onChange={(e) => {
              setError(null);
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > LOGO_MAX_BINARY_BYTES) {
                const kb = Math.round(file.size / 1024);
                setError(
                  `Logo must be ≤ 20 KB (got ${kb} KB). Compress at tinypng.com or export a smaller PNG/SVG.`,
                );
                e.target.value = '';
                return;
              }
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result;
                if (typeof result === 'string') {
                  onChange(result);
                  setImgFailed(false);
                }
              };
              reader.onerror = () => setError('Could not read file.');
              reader.readAsDataURL(file);
              e.target.value = '';
            }}
          />
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              PNG, JPG, or SVG. <strong>Max 20 KB</strong> — logos render at a fixed
              size in emails. SVG preferred for crispness.
            </p>
          )}
        </TabsContent>

        <TabsContent value="url" className="space-y-2">
          <Input
            value={value && /^data:image\//.test(value) ? '' : (value ?? '')}
            onChange={(e) => onChange(e.target.value || null)}
            placeholder="https://cdn.example.com/logos/acme.png"
          />
          <p className="text-sm text-muted-foreground">
            Public URL to a hosted logo image. No size enforcement on
            this path — pick something already optimized.
          </p>
        </TabsContent>
      </Tabs>

      <FormMessage />
    </FormItem>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
}

export function ClientFormDialog({ open, onOpenChange, clientId }: Props) {
  const { data: client } = useClient(clientId || '');
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const isEdit = !!clientId;

  const form = useForm<CreateClientInput>({
    resolver: zodResolver(createClientSchema),
    defaultValues: {
      name: '',
      type: 'FULL',
      isLite: false,
      primaryColor: '#0066CC',
      emailDomains: [],
      defaultCountry: 'US',
    },
  });

  useEffect(() => {
    if (client) {
      form.reset({
        name: client.name,
        type: client.type as 'FULL' | 'LITE',
        isLite: client.isLite || false,
        primaryColor: client.primaryColor,
        logoUrl: client.logoUrl,
        emailDomains: client.emailDomains ?? [],
        defaultCountry: (client.defaultCountry as 'US' | 'CA' | undefined) ?? 'US',
      });
    }
  }, [client, form]);

  async function onSubmit(data: CreateClientInput) {
    try {
      if (isEdit) {
        await updateClient.mutateAsync({ id: clientId!, data });
      } else {
        await createClient.mutateAsync(data);
      }
      onOpenChange(false);
      form.reset();
    } catch (error) {
      // Error is handled by the mutation hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* v1.18.2 — max-h + overflow-y-auto so short-viewport laptops
          can scroll to reach Cancel/Submit at the bottom. Matches the
          pattern used by template-preview-dialog + section-preview-dialog. */}
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Client' : 'Add Client'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Acme Pharma" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Client Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="FULL">Full (Surveys + Data)</SelectItem>
                      <SelectItem value="LITE">Lite (Data Only)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* v1.17.68 — country regime for this client's HCPs.
                Determines which national-ID format the import dialog
                expects (NPI for US, MINC for CA) and how identifiers
                render across the admin surfaces. Per pteam: for a
                customer running both US + CA programs, spin up TWO
                Client rows rather than mixing countries on one. */}
            <FormField
              control={form.control}
              name="defaultCountry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>HCP Country</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? 'US'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="US">United States (NPI)</SelectItem>
                      <SelectItem value="CA">Canada (MINC)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Determines the identifier regime (NPI vs MINC) and scopes
                    HCP imports + list views to this country. Existing US
                    clients stay on the US path.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isLite"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Lite Client Mode</FormLabel>
                    <p className="text-sm text-muted-foreground">
                      Lite clients can view HCPs and scores but cannot run campaigns
                    </p>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="logoUrl"
              render={({ field }) => (
                <LogoField
                  value={field.value ?? null}
                  onChange={(next) => field.onChange(next)}
                />
              )}
            />

            <FormField
              control={form.control}
              name="primaryColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Brand Color</FormLabel>
                  <FormControl>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={field.value}
                        onChange={field.onChange}
                        className="w-16 h-10 p-1"
                      />
                      <Input
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="#0066CC"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="emailDomains"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Allowed Email Domains *</FormLabel>
                  <FormControl>
                    <DomainsInput
                      value={field.value ?? []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <p className="text-sm text-muted-foreground">
                    Comma-separated. Users invited to this client must have
                    an email at one of these domains.{' '}
                    <strong>At least one domain is required.</strong>{' '}
                    Bio-Exec staff (@bio-exec.com) are always allowed
                    regardless of this list.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createClient.isPending || updateClient.isPending}>
                {isEdit ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
