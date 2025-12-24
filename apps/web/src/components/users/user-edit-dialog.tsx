'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { updateUserSchema, UpdateUserInput } from '@kol360/shared';
import { useUpdateUser } from '@/hooks/use-users';
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

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'PLATFORM_ADMIN' | 'CLIENT_ADMIN' | 'TEAM_MEMBER';
  clientId: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: User | null;
}

export function UserEditDialog({ open, onOpenChange, user }: Props) {
  const { user: currentUser } = useAuth();
  const updateUser = useUpdateUser();
  const { data: clientsData } = useClients();
  const clients = clientsData?.items || [];
  const [error, setError] = useState<string | null>(null);

  const isPlatformAdmin = currentUser?.role === 'PLATFORM_ADMIN';

  const form = useForm<UpdateUserInput>({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      role: 'TEAM_MEMBER',
      clientId: null,
    },
  });

  useEffect(() => {
    if (open && user) {
      setError(null);
      form.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        clientId: user.clientId,
      });
    }
  }, [open, user, form]);

  async function onSubmit(data: UpdateUserInput) {
    if (!user) return;
    setError(null);
    try {
      await updateUser.mutateAsync({ id: user.id, data });
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to update user:', err);
      const message = err instanceof Error ? err.message : 'Failed to update user';
      setError(message);
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
          <DialogTitle>Edit User</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                {error}
              </div>
            )}

            <div className="p-3 text-sm text-muted-foreground bg-muted rounded-md">
              {user?.email}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} placeholder="John" />
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
                      <Input {...field} value={field.value || ''} placeholder="Doe" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || user?.role}>
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
              <Button type="submit" disabled={updateUser.isPending}>
                {updateUser.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
