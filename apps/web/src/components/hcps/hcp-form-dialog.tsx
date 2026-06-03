'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createHcpSchema, CreateHcpInput, HCP_SPECIALTIES } from '@kol360/shared';
import { useCreateHcp, useUpdateHcp, useHcp } from '@/hooks/use-hcps';
import { useDiseaseAreas } from '@/hooks/use-disease-areas';
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
import { MultiSelect } from '@/components/ui/multi-select';

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

  // Sub-specialty source of truth = DiseaseArea (per (a) unify decision).
  const { data: diseaseAreasData } = useDiseaseAreas();
  const diseaseAreas = diseaseAreasData?.items ?? [];
  const idToName = new Map(diseaseAreas.map((d) => [d.id, d.name]));
  const nameToId = new Map(diseaseAreas.map((d) => [d.name, d.id]));
  const daOptions = diseaseAreas.map((d) => d.name);

  const form = useForm<CreateHcpInput>({
    resolver: zodResolver(createHcpSchema),
    defaultValues: {
      npi: '',
      firstName: '',
      lastName: '',
      email: '',
      specialty: null,
      diseaseAreaIds: [],
      subSpecialty: null,
      city: null,
      state: null,
    },
  });

  useEffect(() => {
    if (hcp) {
      // Cast loaded `specialty` to the enum if it matches; legacy/out-of-domain
      // values (e.g. 'Oncology') come back as null on the form (kept on the
      // legacy DB column, just not displayed in the controlled dropdown).
      const loadedSpecialty =
        hcp.specialty && (HCP_SPECIALTIES as readonly string[]).includes(hcp.specialty)
          ? (hcp.specialty as (typeof HCP_SPECIALTIES)[number])
          : null;
      const loadedDaIds = (hcp.diseaseAreas ?? []).map((d) => d.diseaseArea.id);
      form.reset({
        npi: hcp.npi || '',
        firstName: hcp.firstName,
        lastName: hcp.lastName,
        email: hcp.email || '',
        specialty: loadedSpecialty,
        diseaseAreaIds: loadedDaIds,
        subSpecialty: hcp.subSpecialty,
        city: hcp.city,
        state: hcp.state,
      });
    } else if (!hcpId) {
      form.reset({
        npi: '',
        firstName: '',
        lastName: '',
        email: '',
        specialty: null,
        diseaseAreaIds: [],
        subSpecialty: null,
        city: null,
        state: null,
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
                  <FormLabel>Email *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value)}
                      type="email"
                      placeholder="john@hospital.com"
                    />
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    Required. If you don't have one yet, use the placeholder:{' '}
                    <button
                      type="button"
                      className="text-primary underline hover:no-underline"
                      onClick={() => field.onChange('nomail@kol360research.com')}
                    >
                      nomail@kol360research.com
                    </button>
                  </p>
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
                      {HCP_SPECIALTIES.map((specialty) => (
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

            <FormField
              control={form.control}
              name="diseaseAreaIds"
              render={({ field }) => {
                const selectedNames = (field.value ?? [])
                  .map((id) => idToName.get(id))
                  .filter((n): n is string => !!n);
                return (
                  <FormItem>
                    <FormLabel>Sub-specialty (optional, multi-select)</FormLabel>
                    <FormControl>
                      <MultiSelect
                        options={daOptions}
                        selected={selectedNames}
                        onChange={(names) => {
                          const ids = names
                            .map((n) => nameToId.get(n))
                            .filter((id): id is string => !!id);
                          field.onChange(ids);
                        }}
                        placeholder="Select sub-specialty…"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                );
              }}
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
