'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createUserSchema, CreateUserInput } from '@kol360/shared';
import { useInviteUser } from '@/hooks/use-users';
import { useClients } from '@/hooks/use-clients';
import { useAuth } from '@/lib/auth/auth-provider';
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
}

export function UserInviteDialog({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const inviteUser = useInviteUser();
  const { data: clientsData } = useClients();
  const clients = clientsData?.items || [];

  const isPlatformAdmin = user?.role === 'PLATFORM_ADMIN';

  const form = useForm<CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      role: 'TEAM_MEMBER',
      clientId: null,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        email: '',
        firstName: '',
        lastName: '',
        role: 'TEAM_MEMBER',
        clientId: null,
      });
    }
  }, [open, form]);

  async function onSubmit(data: CreateUserInput) {
    try {
      await inviteUser.mutateAsync(data);
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Failed to invite user:', error);
    }
  }

  // Filter available roles based on current user's role
  const availableRoles = isPlatformAdmin
    ? ['PLATFORM_ADMIN', 'CLIENT_ADMIN', 'TEAM_MEMBER']
    : ['CLIENT_ADMIN', 'TEAM_MEMBER'];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite User</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                      <Input {...field} placeholder="Doe" />
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
                    <Input {...field} type="email" placeholder="john@example.com" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableRoles.map((role) => (
                        <SelectItem key={role} value={role}>
                          {role === 'PLATFORM_ADMIN'
                            ? 'Platform Admin'
                            : role === 'CLIENT_ADMIN'
                            ? 'Client Admin'
                            : 'Team Member'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isPlatformAdmin && (
              <FormField
                control={form.control}
                name="clientId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value === 'none' ? null : value)}
                      value={field.value || 'none'}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a client" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">No Client (Platform User)</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={inviteUser.isPending}>
                {inviteUser.isPending ? 'Inviting...' : 'Send Invitation'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
