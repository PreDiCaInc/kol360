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
      <DialogContent>
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
                <FormItem>
                  <FormLabel>Logo URL</FormLabel>
                  <FormControl>
                    <Input
                      value={field.value ?? ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      placeholder="https://cdn.example.com/logos/acme.png"
                    />
                  </FormControl>
                  <p className="text-sm text-muted-foreground">
                    Public URL to a hosted logo image (square works best).
                    Falls back to a tinted initials avatar if blank.
                  </p>
                  <FormMessage />
                </FormItem>
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
