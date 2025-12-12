'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function UnauthorizedPage() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>You do not have permission to access this page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            If you believe this is an error, please contact your administrator.
          </p>
          <div className="flex gap-4">
            <Button asChild variant="outline">
              <Link href="/">Go Home</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Sign In</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
