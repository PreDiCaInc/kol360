'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createHcpSchema, CreateHcpInput } from '@kol360/shared';
import { useCreateHcp, useUpdateHcp, useHcp } from '@/hooks/use-hcps';
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

// Allowed specialties for the application
const ALLOWED_SPECIALTIES = [
  'Ophthalmology',
  'Cornea',
  'Glaucoma',
  'Retina',
  'Dry Eye',
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hcpId?: string;
}

export function HcpFormDialog({ open, onOpenChange, hcpId }: Props) {
  const { data: hcp } = useHcp(hcpId || '');
  const createHcp = useCreateHcp();
  const updateHcp = useUpdateHcp();
  const isEdit = !!hcpId;

  const form = useForm<CreateHcpInput>({
    resolver: zodResolver(createHcpSchema),
    defaultValues: {
      npi: '',
      firstName: '',
      lastName: '',
      email: null,
      specialty: null,
      subSpecialty: null,
      city: null,
      state: null,
      yearsInPractice: null,
    },
  });

  useEffect(() => {
    if (hcp) {
      form.reset({
        npi: hcp.npi,
        firstName: hcp.firstName,
        lastName: hcp.lastName,
        email: hcp.email,
        specialty: hcp.specialty,
        subSpecialty: hcp.subSpecialty,
        city: hcp.city,
        state: hcp.state,
        yearsInPractice: hcp.yearsInPractice,
      });
    } else if (!hcpId) {
      form.reset({
        npi: '',
        firstName: '',
        lastName: '',
        email: null,
        specialty: null,
        subSpecialty: null,
        city: null,
        state: null,
        yearsInPractice: null,
      });
    }
  }, [hcp, hcpId, form]);

  async function onSubmit(data: CreateHcpInput) {
    try {
      if (isEdit) {
        const { npi: _, ...updateData } = data;
        await updateHcp.mutateAsync({ id: hcpId!, data: updateData });
      } else {
        await createHcp.mutateAsync(data);
      }
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Failed to save HCP:', error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit HCP' : 'Add HCP'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="npi"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>NPI</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="1234567890"
                      maxLength={10}
                      disabled={isEdit}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="John" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Smith" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      type="email"
                      placeholder="john@hospital.com"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="specialty"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Specialty</FormLabel>
                  <Select
                    value={field.value || ''}
                    onValueChange={(value) => field.onChange(value || null)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select specialty" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {ALLOWED_SPECIALTIES.map((specialty) => (
                        <SelectItem key={specialty} value={specialty}>
                          {specialty}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        placeholder="Boston"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>State</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        value={field.value || ''}
                        onChange={(e) => field.onChange(e.target.value || null)}
                        placeholder="MA"
                        maxLength={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="yearsInPractice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Years in Practice</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        value={field.value ?? ''}
                        onChange={(e) =>
                          field.onChange(e.target.value ? parseInt(e.target.value) : null)
                        }
                        placeholder="15"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createHcp.isPending || updateHcp.isPending}>
                {isEdit ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
