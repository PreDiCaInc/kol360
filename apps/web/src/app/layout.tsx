import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryProvider } from '@/lib/query-client';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { AuthInitializer } from '@/components/auth/auth-initializer';
import { EnvironmentBanner } from '@/components/environment-banner';

const inter = Inter({ subsets: ['latin'] });

// Check if this is a test/staging environment for title prefix
const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
const isTestEnvironment = apiUrl.includes('test') ||
  apiUrl.includes('staging') ||
  apiUrl.includes('mpcu4inmtj');

export const metadata: Metadata = {
  title: isTestEnvironment ? '[TEST] KOL360' : 'KOL360',
  description: 'KOL Survey Platform',
  // v1.17.65 — explicitly declare the favicon so it's emitted as a
  // <link rel="icon"> in every page's <head>. Without this the App
  // Router only serves /favicon.ico if it's mirrored into app/; ours
  // lives under public/ so some pages (e.g. /admin/dashboards/guide)
  // were rendering without the tab icon.
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <EnvironmentBanner />
        <AuthProvider>
          <AuthInitializer />
          <QueryProvider>{children}</QueryProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
