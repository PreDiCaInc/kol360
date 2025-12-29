/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@kol360/shared'],

  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Disable image optimization (can enable with external loader later)
  images: {
    unoptimized: true,
  },

  // Environment variables for production build (App Runner doesn't pass env vars to build phase)
  env: {
    NEXT_PUBLIC_COGNITO_USER_POOL_ID: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || 'us-east-2_63CJVTAV9',
    NEXT_PUBLIC_COGNITO_CLIENT_ID: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '7tqkritsrh3dgmaj6oq8va46vj',
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://ik6dmnn2ra.us-east-2.awsapprunner.com',
  },
};

export default nextConfig;
