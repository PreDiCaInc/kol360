'use client';

import { useEffect } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
      primaryColor: '#0066CC',
    },
  });

  useEffect(() => {
    if (client) {
      form.reset({
        name: client.name,
        type: client.type as 'FULL' | 'LITE',
        primaryColor: client.primaryColor,
        logoUrl: client.logoUrl,
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
      console.error('Failed to save client:', error);
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
