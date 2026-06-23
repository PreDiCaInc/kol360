/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kol360/shared'],

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Disable image optimization (can enable with external loader later)
  images: {
    unoptimized: true,
  },

  // Remove X-Powered-By: Next.js header
  poweredByHeader: false,

  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "img-src 'self' data: https:",
              "font-src 'self' data: https://fonts.gstatic.com",
              "connect-src 'self' http://localhost:3001 https://mpcu4inmtj.us-east-2.awsapprunner.com https://ik6dmnn2ra.us-east-2.awsapprunner.com https://cognito-idp.us-east-2.amazonaws.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
        ],
      },
      {
        // v1.17.62 — static images + Next.js bundles need to be
        // embeddable in third-party contexts (email clients pulling
        // remote images, Open Graph previews, status pages embedding
        // assets). The default `same-origin` above is correct for
        // HTML/JS responses (Spectre-style protection) but blocked
        // every browser-based webmail client from rendering the
        // logo. Next.js processes header blocks in source order;
        // same-key entries from later blocks override earlier ones,
        // so this strictly relaxes CORP for asset paths and leaves
        // everything else locked down.
        // Ticket: docs/findings/email-logo-corp-blocks-webmail-render-2026-06-23.md
        source: '/(images|_next/static)/(.*)',
        headers: [
          { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
